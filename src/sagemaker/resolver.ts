/**
 * SageMaker endpoint resolution: model name -> endpoint name (spec §7).
 *
 * Auto-discovery is the DEFAULT mechanism. With only region + credentials configured,
 * `resolve(model)` inspects the account's InService endpoints and identifies each one by the
 * Marketplace `ProductId` embedded in its model package, mapping that ProductId to a
 * canonical Voyage model name via {@link PRODUCT_MAP}. The explicit `endpointMap` is an
 * optional override consulted only for models the user listed.
 *
 * Why ProductId and not the model-package ARN: the ARN carries a version + hash that changes
 * on every new model release, so matching on it is brittle. The ProductId is stable across
 * releases and changes only when a NEW product is listed — it is the canonical identity of a
 * Voyage Marketplace listing.
 *
 * Endpoints whose ProductId is absent (self-built packages) or unrecognized (not a public
 * Voyage listing — e.g. the internal voyage-multimodal-3 package) are SKIPPED, never guessed:
 * they must be reached with an explicit `endpointMap` entry. When a discovery control-plane
 * call is denied by IAM, the underlying discovery raises a {@link SageMakerAuthError} that
 * propagates unchanged so the caller can point the user at the required permissions or the
 * `endpointMap` escape hatch.
 */

import type { SageMakerConfig } from "./config.js";
import { SageMakerResolutionError } from "./errors.js";

/** Discovery primitives, mirroring the underlying AWS SageMaker control-plane calls. */
export interface SageMakerDiscovery {
    /** Paginated `ListEndpoints` with `StatusEquals="InService"`. */
    listInServiceEndpointNames(): Promise<string[]>;
    /**
     * Resolve an endpoint to its Marketplace `ProductId` via the
     * `DescribeEndpoint -> DescribeEndpointConfig -> DescribeModel -> DescribeModelPackage`
     * chain, reading `InferenceSpecification.Containers[0].ProductId`. Returns `undefined`
     * when the endpoint is not backed by a Marketplace package (self-built model, no
     * `ProductId`). Raises {@link SageMakerAuthError} if a control-plane call is denied.
     */
    getEndpointProductId(endpointName: string): Promise<string | undefined>;
}

/** `normalize(s) = s.lower().replace(".", "-")` (spec §3). */
export function normalizeName(value: string): string {
    return value.toLowerCase().replace(/\./g, "-");
}

interface Inventory {
    endpointNames: string[];
}

export class SageMakerEndpointResolver {
    private readonly config: SageMakerConfig;
    private readonly discovery: SageMakerDiscovery;
    private readonly productMap: Readonly<Record<string, string>>;
    private readonly cache: Map<string, string> = new Map();
    private readonly inFlight: Map<string, Promise<string>> = new Map();

    constructor(config: SageMakerConfig, discovery: SageMakerDiscovery, productMap: Readonly<Record<string, string>>) {
        this.config = config;
        this.discovery = discovery;
        this.productMap = productMap;
    }

    /** Resolve `model` to an endpoint name, or throw a resolution / auth error. */
    public async resolve(model: string): Promise<string> {
        const cached = this.cache.get(model);
        if (cached !== undefined) {
            return cached;
        }
        // Dedupe concurrent resolves of the same model (async equivalent of the
        // Python resolver's per-instance lock) so the inventory is fetched once.
        const pending = this.inFlight.get(model);
        if (pending !== undefined) {
            return pending;
        }
        const promise = this.resolveUncached(model)
            .then((endpoint) => {
                this.cache.set(model, endpoint);
                return endpoint;
            })
            .finally(() => {
                this.inFlight.delete(model);
            });
        this.inFlight.set(model, promise);
        return promise;
    }

    private async resolveUncached(model: string): Promise<string> {
        // T1 — explicit override (exact, non-normalized key match). No AWS call.
        const override = this.config.endpointMap[model];
        if (override !== undefined) {
            return override;
        }

        const normModel = normalizeName(model);
        const inventory: Inventory = { endpointNames: await this.discovery.listInServiceEndpointNames() };

        // T2 — discovery (default path). Identify each endpoint by its Marketplace ProductId
        // and map that to a canonical model name; keep the endpoints whose model matches.
        // Unknown / absent ProductIds are skipped (never guessed).
        const candidates: string[] = [];
        for (const endpointName of inventory.endpointNames) {
            const productId = await this.discovery.getEndpointProductId(endpointName);
            if (productId === undefined) {
                continue;
            }
            const mapped = this.productMap[productId];
            if (mapped === undefined) {
                continue;
            }
            if (normalizeName(mapped) === normModel) {
                candidates.push(endpointName);
            }
        }

        if (candidates.length === 1) {
            return candidates[0];
        }
        if (candidates.length > 1) {
            throw this.ambiguousError(model, candidates);
        }
        throw this.noCandidateError(model, inventory.endpointNames);
    }

    private noCandidateError(model: string, allNames: string[]): SageMakerResolutionError {
        const sorted = JSON.stringify([...allNames].sort());
        return new SageMakerResolutionError(
            `No SageMaker endpoint found for model '${model}' in region '${this.config.region}'. ` +
                `InService endpoints checked: ${sorted}. The endpoint may serve a model that is not a ` +
                "recognized public Voyage listing (e.g. a self-built or internal package). Provide an " +
                `explicit mapping via endpointMap={'${model}': '<endpoint-name>'}.`,
        );
    }

    private ambiguousError(model: string, candidates: string[]): SageMakerResolutionError {
        const sorted = JSON.stringify([...candidates].sort());
        return new SageMakerResolutionError(
            `Multiple SageMaker endpoints serve model '${model}' in region '${this.config.region}': ${sorted}. ` +
                `Disambiguate with an explicit endpointMap={'${model}': '<endpoint-name>'} entry.`,
        );
    }
}
