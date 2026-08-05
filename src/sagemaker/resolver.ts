/**
 * SageMaker endpoint resolution: model name -> endpoint name (spec §7).
 *
 * Auto-discovery is the DEFAULT mechanism. With only region + credentials configured,
 * `resolve(model)` inspects the account's InService endpoints and matches the model
 * against the model-package ARN embedded in each endpoint's model. The explicit
 * `endpointMap` is an optional override consulted only for models the user listed; the
 * `voyageai:model` tag and the name convention are disambiguators / zero-candidate
 * fallbacks, not standalone tiers.
 *
 * NOTE (spec T6): the token-boundary predicate below cannot always distinguish
 * `voyage-4` from a `voyage-4-large` package. The deterministic escape hatches are the
 * `endpointMap` (T1) and the `voyageai:model` tag (T3). Phase V live verification of the
 * real model-package ARN format was NOT performed (no live AWS account was available to
 * the implementer), so the predicate is left at the spec's token-boundary default.
 * Observed ARN format: UNVERIFIED — expected shape
 * `arn:aws:sagemaker:<region>:<acct>:model-package/<name>[-<version>]`, matched on the
 * final `/`-delimited resource segment, normalized.
 */

import type { SageMakerConfig } from "./config.js";
import { SageMakerResolutionError } from "./errors.js";

/** Discovery primitives, mirroring the underlying AWS SageMaker control-plane calls. */
export interface SageMakerDiscovery {
    /** Paginated `ListEndpoints` with `StatusEquals="InService"`. */
    listInServiceEndpointNames(): Promise<string[]>;
    /**
     * `DescribeEndpoint` -> `DescribeEndpointConfig` -> `DescribeModel`, collecting every
     * `PrimaryContainer.ModelPackageName` / `Containers[*].ModelPackageName` ARN.
     */
    getEndpointModelPackageArns(endpointName: string): Promise<string[]>;
    /** `ListTags` for the endpoint; returns the value of the `voyageai:model` tag if present. */
    getEndpointModelTag(endpointName: string): Promise<string | undefined>;
}

/** `normalize(s) = s.lower().replace(".", "-")` (spec §3). */
export function normalizeName(value: string): string {
    return value.toLowerCase().replace(/\./g, "-");
}

/** Final `/`-delimited resource segment of an ARN (or the whole string if none). */
function arnResourceSegment(arn: string): string {
    const slash = arn.lastIndexOf("/");
    return slash === -1 ? arn : arn.slice(slash + 1);
}

/**
 * True iff `normModel` occurs in `normHaystack` at token boundaries: the character
 * before the match is start-of-string or `-`, and the character after is
 * end-of-string or `-` (spec T2).
 */
export function matchesAtTokenBoundary(normHaystack: string, normModel: string): boolean {
    if (normModel.length === 0) {
        return false;
    }
    let from = 0;
    for (;;) {
        const idx = normHaystack.indexOf(normModel, from);
        if (idx === -1) {
            return false;
        }
        const before = idx === 0 ? "-" : normHaystack[idx - 1];
        const afterIdx = idx + normModel.length;
        const after = afterIdx === normHaystack.length ? "-" : normHaystack[afterIdx];
        if (before === "-" && after === "-") {
            return true;
        }
        from = idx + 1;
    }
}

interface Inventory {
    endpointNames: string[];
}

export class SageMakerEndpointResolver {
    private readonly config: SageMakerConfig;
    private readonly discovery: SageMakerDiscovery;
    private readonly cache: Map<string, string> = new Map();
    private readonly inFlight: Map<string, Promise<string>> = new Map();

    constructor(config: SageMakerConfig, discovery: SageMakerDiscovery) {
        this.config = config;
        this.discovery = discovery;
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

        // T2 — discovery (default path).
        const candidates: string[] = [];
        for (const endpointName of inventory.endpointNames) {
            const arns = await this.discovery.getEndpointModelPackageArns(endpointName);
            const isCandidate = arns.some((arn) =>
                matchesAtTokenBoundary(normalizeName(arnResourceSegment(arn)), normModel),
            );
            if (isCandidate) {
                candidates.push(endpointName);
            }
        }

        if (candidates.length === 1) {
            return candidates[0];
        }
        if (candidates.length > 1) {
            return this.disambiguate(model, normModel, candidates);
        }

        // T3 — convention fallback (zero-candidate case only).
        return this.conventionFallback(model, normModel, inventory.endpointNames);
    }

    private async disambiguate(model: string, normModel: string, candidates: string[]): Promise<string> {
        // (a) exactly one candidate tagged voyageai:model == model (case-sensitive).
        const tagged: string[] = [];
        for (const name of candidates) {
            const tagValue = await this.discovery.getEndpointModelTag(name);
            if (tagValue === model) {
                tagged.push(name);
            }
        }
        if (tagged.length === 1) {
            return tagged[0];
        }
        // (b) exactly one candidate whose name equals normalize(model).
        const nameMatches = candidates.filter((name) => normalizeName(name) === normModel);
        if (nameMatches.length === 1) {
            return nameMatches[0];
        }
        throw this.ambiguousError(model, candidates);
    }

    private async conventionFallback(model: string, normModel: string, allNames: string[]): Promise<string> {
        // (a) exactly one InService endpoint tagged voyageai:model == model.
        const tagged: string[] = [];
        for (const name of allNames) {
            const tagValue = await this.discovery.getEndpointModelTag(name);
            if (tagValue === model) {
                tagged.push(name);
            }
        }
        if (tagged.length === 1) {
            return tagged[0];
        }
        if (tagged.length > 1) {
            throw this.ambiguousError(model, tagged);
        }
        // (b) exactly one endpoint whose name equals normalize(model).
        const nameMatches = allNames.filter((name) => normalizeName(name) === normModel);
        if (nameMatches.length === 1) {
            return nameMatches[0];
        }
        if (nameMatches.length > 1) {
            throw this.ambiguousError(model, nameMatches);
        }
        throw this.noCandidateError(model, allNames);
    }

    private noCandidateError(model: string, allNames: string[]): SageMakerResolutionError {
        const sorted = JSON.stringify([...allNames].sort());
        return new SageMakerResolutionError(
            `No SageMaker endpoint found for model '${model}' in region '${this.config.region}'. ` +
                `InService endpoints checked: ${sorted}. Provide an explicit mapping via ` +
                `endpointMap={'${model}': '<endpoint-name>'} or tag the endpoint with voyageai:model=${model}.`,
        );
    }

    private ambiguousError(model: string, candidates: string[]): SageMakerResolutionError {
        const sorted = JSON.stringify([...candidates].sort());
        return new SageMakerResolutionError(
            `Multiple SageMaker endpoints match model '${model}' in region '${this.config.region}': ${sorted}. ` +
                "Disambiguate via endpointMap or the voyageai:model tag.",
        );
    }
}
