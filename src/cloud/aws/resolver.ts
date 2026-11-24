/**
 * SageMaker endpoint resolution: model name -> endpoint name.
 *
 * Auto-discovery is the DEFAULT mechanism. With only region + credentials configured,
 * `resolve(model)` inspects the account's InService endpoints and identifies each one by the
 * Marketplace `ProductId` embedded in its model package, mapping that ProductId to a
 * canonical Voyage model name via the product map. The explicit `endpointMap` is an optional
 * override consulted only for models the user listed.
 *
 * Tie-breaks (both for multiple candidates and for zero candidates, per the spec): a
 * `voyageai:model` endpoint tag first, then an endpoint name equal to `normalize(model)`.
 *
 * Endpoints whose ProductId is absent (self-built packages) or unrecognized (not a public
 * Voyage listing) are SKIPPED, never guessed: they are reachable via `endpointMap` or the
 * tag fallback. When a discovery control-plane call is denied by IAM, the discovery raises a
 * `ProviderResolutionError` with kind `authentication` that propagates unchanged.
 */

import { ProviderResolutionError } from "../providers.js";
import type { SageMakerConfig } from "./config.js";

/** Discovery primitives, mirroring the underlying AWS SageMaker control-plane calls. */
export interface SageMakerDiscovery {
    /** Paginated `ListEndpoints` with `StatusEquals="InService"`. */
    listInServiceEndpointNames(): Promise<string[]>;
    /**
     * Resolve an endpoint to its Marketplace `ProductId` via the
     * `DescribeEndpoint -> DescribeEndpointConfig -> DescribeModel -> DescribeModelPackage`
     * chain, reading `InferenceSpecification.Containers[0].ProductId`. Returns `undefined`
     * when the endpoint is not backed by a Marketplace package (self-built model, no
     * `ProductId`).
     */
    getEndpointProductId(endpointName: string): Promise<string | undefined>;
    /** Value of the endpoint's `voyageai:model` tag, or `undefined` when untagged. */
    getEndpointModelTag(endpointName: string): Promise<string | undefined>;
}

/** `normalize(s) = s.lower().replace(".", "-")`, as in the Python SDK. */
export function normalizeName(value: string): string {
    return value.toLowerCase().replace(/\./g, "-");
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

    /** Resolve `model` to an endpoint name, or throw a `ProviderResolutionError`. */
    public async resolve(model: string): Promise<string> {
        const cached = this.cache.get(model);
        if (cached !== undefined) {
            return cached;
        }
        // Dedupe concurrent resolves of the same model (async equivalent of the Python
        // resolver's per-instance lock) so the inventory is fetched once.
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
        const allEndpoints = await this.discovery.listInServiceEndpointNames();

        // T2 — discovery (default path). Identify each endpoint by its Marketplace ProductId
        // and map that to a canonical model name; keep the endpoints whose model matches.
        // Unknown / absent ProductIds are skipped (never guessed).
        const candidates: string[] = [];
        for (const endpointName of allEndpoints) {
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

        // Tie-breaks: evaluated over the candidates when there are several, and
        // over ALL InService endpoints when there is none — a tagged or conventionally named
        // endpoint is reachable even when ProductId identification cannot see it.
        const pool = candidates.length > 1 ? candidates : allEndpoints;
        const tagged = await this.filterByModelTag(pool, normModel);
        if (tagged.length === 1) {
            return tagged[0];
        }
        const named = pool.filter((endpointName) => endpointName === normModel);
        if (named.length === 1) {
            return named[0];
        }

        throw candidates.length > 1
            ? this.ambiguousError(model, candidates)
            : this.noCandidateError(model, allEndpoints);
    }

    private async filterByModelTag(endpointNames: string[], normModel: string): Promise<string[]> {
        const matches: string[] = [];
        for (const endpointName of endpointNames) {
            const tag = await this.discovery.getEndpointModelTag(endpointName);
            if (tag !== undefined && normalizeName(tag) === normModel) {
                matches.push(endpointName);
            }
        }
        return matches;
    }

    private noCandidateError(model: string, allNames: string[]): ProviderResolutionError {
        const sorted = JSON.stringify([...allNames].sort());
        return new ProviderResolutionError(
            `No SageMaker endpoint found for model '${model}' in region '${this.config.region}'. ` +
                `InService endpoints checked: ${sorted}. The endpoint may serve a model that is not a ` +
                "recognized public Voyage listing (e.g. a self-built or internal package). Provide an " +
                `explicit mapping via endpointMap={'${model}': '<endpoint-name>'}, or tag the endpoint ` +
                `with voyageai:model=${model}.`,
            "invalid_request",
        );
    }

    private ambiguousError(model: string, candidates: string[]): ProviderResolutionError {
        const sorted = JSON.stringify([...candidates].sort());
        return new ProviderResolutionError(
            `Multiple SageMaker endpoints serve model '${model}' in region '${this.config.region}': ${sorted}. ` +
                `Disambiguate with an explicit endpointMap={'${model}': '<endpoint-name>'} entry, or tag ` +
                `exactly one endpoint with voyageai:model=${model}.`,
            "invalid_request",
        );
    }
}
