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
 * ARN format (live-verified against Voyage's SageMaker Marketplace packages):
 * `arn:aws:sagemaker:<region>:<acct>:model-package/<name>[-v<version>-<hash>]`, e.g.
 * `.../model-package/voyage-4-lite-v3-75769a90…`, `.../voyage-multimodal-3-5-v1-28013f9c…`,
 * and the bare marketplace form `.../voyage-multimodal-3`. Matching is done on the final
 * `/`-delimited resource segment, normalized.
 *
 * Two ARN match tiers, checked per endpoint (spec T2):
 *   (a) EXACT — the segment with any `-v<version>-<hash>` suffix stripped equals the
 *       normalized model name. This is the deterministic, metadata-driven mapping and it
 *       is what disambiguates e.g. `voyage-multimodal-3` from `voyage-multimodal-3-5`:
 *       stripping leaves `voyage-multimodal-3` vs `voyage-multimodal-3-5`, which differ.
 *   (b) TOKEN-BOUNDARY — looser containment fallback for ARNs that do not follow the
 *       `-v<version>-<hash>` convention. Only consulted when tier (a) finds no endpoint,
 *       so it never reintroduces the `voyage-3` / `voyage-3-large` ambiguity for the
 *       versioned packages above. The `endpointMap` (T1) and `voyageai:model` tag (T3)
 *       remain the escape hatches when even (b) is ambiguous.
 */

import type { SageMakerConfig } from "./config.js";
import { SageMakerAuthError, SageMakerResolutionError } from "./errors.js";

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
 * Strip a trailing Voyage model-package version+hash suffix (`-v<version>` optionally
 * followed by a `-<hex>` build hash) from a normalized ARN resource segment, leaving the
 * bare model name. No-op for segments without the suffix (e.g. marketplace `voyage-multimodal-3`).
 */
export function stripPackageVersionSuffix(normSegment: string): string {
    return normSegment.replace(/-v\d+(?:-[0-9a-f]{6,})?$/, "");
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

        // T2 — discovery (default path). Prefer exact metadata matches (version+hash
        // suffix stripped); fall back to loose token-boundary matches only when no
        // endpoint matches exactly, so versioned packages never collide.
        const exact: string[] = [];
        const loose: string[] = [];
        for (const endpointName of inventory.endpointNames) {
            const arns = await this.discovery.getEndpointModelPackageArns(endpointName);
            const normSegments = arns.map((arn) => normalizeName(arnResourceSegment(arn)));
            if (normSegments.some((seg) => stripPackageVersionSuffix(seg) === normModel)) {
                exact.push(endpointName);
            } else if (normSegments.some((seg) => matchesAtTokenBoundary(seg, normModel))) {
                loose.push(endpointName);
            }
        }
        const candidates = exact.length > 0 ? exact : loose;

        if (candidates.length === 1) {
            return candidates[0];
        }
        if (candidates.length > 1) {
            return this.disambiguate(model, normModel, candidates);
        }

        // T3 — convention fallback (zero-candidate case only).
        return this.conventionFallback(model, normModel, inventory.endpointNames);
    }

    /**
     * `getEndpointModelTag`, degrading a tag-permission denial to "no tag". The tag is only
     * a secondary disambiguator; by the time it is consulted the primary discovery calls
     * (ListEndpoints/DescribeEndpoint/…) have already succeeded with the same credentials,
     * so a missing `sagemaker:ListTags` permission must not hard-fail resolution — it should
     * degrade so the resolution-not-found path (and thus API fallback) stays reachable.
     */
    private async safeTag(name: string): Promise<string | undefined> {
        try {
            return await this.discovery.getEndpointModelTag(name);
        } catch (error) {
            if (error instanceof SageMakerAuthError) {
                return undefined;
            }
            throw error;
        }
    }

    private async disambiguate(model: string, normModel: string, candidates: string[]): Promise<string> {
        // (a) exactly one candidate tagged voyageai:model == model (case-sensitive).
        const tagged: string[] = [];
        for (const name of candidates) {
            const tagValue = await this.safeTag(name);
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
            const tagValue = await this.safeTag(name);
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
