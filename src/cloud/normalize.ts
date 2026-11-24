/**
 * Voyage-container response envelope normalization.
 *
 * Every cloud marketplace (SageMaker today; Azure and GCP later) runs the same Voyage
 * serving containers, so the envelope quirks — and their fixes — are shared here. The Voyage
 * API response is authoritative; a container body is reshaped to the exact same envelope so
 * callers cannot tell which backend served the call. Providers apply these helpers from
 * their transport's `responseHandler`.
 */

/**
 * Top-level response keys the Voyage API emits, per response type. Serving containers add
 * runtime telemetry keys the API never returns (e.g. `inference_ms`, `total_embed_ms`);
 * these whitelists drop those extras so both paths yield the same top-level shape. Nested
 * passthrough is untouched, so usage sub-keys / data-item extras that the API also returns
 * survive on both paths.
 */
export const EMBED_RESPONSE_KEYS: readonly string[] = ["object", "data", "model", "usage"];
export const RERANK_RESPONSE_KEYS: readonly string[] = ["object", "data", "model", "usage"];
export const CONTEXTUALIZED_RESPONSE_KEYS: readonly string[] = ["object", "data", "model", "chunker_version", "usage"];

/**
 * Drop top-level keys not in `allowed`, so a container response matches the Voyage API's
 * top-level shape. Only the object's own top level is touched; nested values pass through
 * untouched. Returns the input unchanged when nothing is dropped.
 */
export function stripUnknownTopLevelKeys(body: unknown, allowed: readonly string[]): unknown {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        return body;
    }
    const obj = body as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    let dropped = false;
    for (const key of Object.keys(obj)) {
        if (allowed.includes(key)) {
            kept[key] = obj[key];
        } else {
            dropped = true;
        }
    }
    return dropped ? kept : body;
}

/** Pixel/token usage keys the Voyage API always reports on a multimodal response (0 when absent). */
const MULTIMODAL_USAGE_KEYS: readonly string[] = ["text_tokens", "image_pixels", "video_pixels"];

/**
 * Transform a container embed/multimodal response body into the exact Voyage API envelope:
 *   (1) drop container-only top-level telemetry keys (e.g. `inference_ms`, `total_embed_ms`)
 *       the API never returns;
 *   (2) legacy Marketplace containers (e.g. the `voyage-multimodal-3` package) return `data`
 *       as bare float arrays instead of `{ object, embedding, index }` objects — wrap those;
 *   (3) add `text: null` to every data item — the API always includes it, some containers omit it;
 *   (4) for multimodal, backfill the usage pixel/token keys the API always reports (defaulting
 *       to 0), which older containers (voyage-multimodal-3) omit.
 * Bodies already matching the API shape pass through untouched.
 */
export function normalizeEmbeddingBody(body: unknown, multimodal: boolean): unknown {
    const stripped = stripUnknownTopLevelKeys(body, EMBED_RESPONSE_KEYS);
    if (stripped == null || typeof stripped !== "object" || Array.isArray(stripped)) {
        return stripped;
    }
    const obj = stripped as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };
    let mutated = stripped !== body;

    if (Array.isArray(obj.data)) {
        let dataMutated = false;
        const data = obj.data.map((item, index) => {
            if (Array.isArray(item)) {
                dataMutated = true;
                return { object: "embedding", embedding: item, index, text: null };
            }
            if (item != null && typeof item === "object" && !("text" in item)) {
                dataMutated = true;
                return { ...(item as Record<string, unknown>), text: null };
            }
            return item;
        });
        if (dataMutated) {
            out.data = data;
            mutated = true;
        }
    }

    if (multimodal && obj.usage != null && typeof obj.usage === "object" && !Array.isArray(obj.usage)) {
        const usage = obj.usage as Record<string, unknown>;
        const filled: Record<string, unknown> = { ...usage };
        let usageMutated = false;
        for (const key of MULTIMODAL_USAGE_KEYS) {
            if (!(key in usage)) {
                filled[key] = 0;
                usageMutated = true;
            }
        }
        if (usageMutated) {
            out.usage = filled;
            mutated = true;
        }
    }

    return mutated ? out : body;
}
