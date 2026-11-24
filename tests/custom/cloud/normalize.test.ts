/**
 * Envelope normalization helpers: identity on already-conformant bodies, and each
 * individual reshaping rule in isolation.
 */

import { describe, expect, test } from "vitest";
import {
    CONTEXTUALIZED_RESPONSE_KEYS,
    EMBED_RESPONSE_KEYS,
    normalizeEmbeddingBody,
    RERANK_RESPONSE_KEYS,
    stripUnknownTopLevelKeys,
} from "../../../src/cloud/normalize";

describe("stripUnknownTopLevelKeys", () => {
    test("non-object bodies pass through by reference", () => {
        const list = [1, 2];
        expect(stripUnknownTopLevelKeys(null, EMBED_RESPONSE_KEYS)).toBeNull();
        expect(stripUnknownTopLevelKeys(undefined, EMBED_RESPONSE_KEYS)).toBeUndefined();
        expect(stripUnknownTopLevelKeys("text", EMBED_RESPONSE_KEYS)).toBe("text");
        expect(stripUnknownTopLevelKeys(list, EMBED_RESPONSE_KEYS)).toBe(list);
    });

    test("a conformant body is returned by reference", () => {
        const body = { object: "list", data: [], model: "m", usage: { total_tokens: 1 } };
        expect(stripUnknownTopLevelKeys(body, EMBED_RESPONSE_KEYS)).toBe(body);
    });

    test("extra top-level keys are dropped; nested values are untouched", () => {
        const usage = { total_tokens: 1, text_tokens: 1, extra_nested: true };
        const body = { object: "list", data: [], model: "m", usage, inference_ms: 3 };
        const out = stripUnknownTopLevelKeys(body, EMBED_RESPONSE_KEYS) as Record<string, unknown>;
        expect(Object.keys(out).sort()).toEqual(["data", "model", "object", "usage"]);
        expect(out.usage).toBe(usage);
        expect(body.inference_ms).toBe(3);
    });

    test("the contextualized whitelist keeps chunker_version; rerank matches embed", () => {
        expect(CONTEXTUALIZED_RESPONSE_KEYS).toContain("chunker_version");
        expect(RERANK_RESPONSE_KEYS).toEqual(EMBED_RESPONSE_KEYS);
    });
});

describe("normalizeEmbeddingBody", () => {
    const item = { object: "embedding", embedding: [0.1], index: 0, text: null };

    test("non-object bodies pass through", () => {
        expect(normalizeEmbeddingBody(null, false)).toBeNull();
        expect(normalizeEmbeddingBody("oops", true)).toBe("oops");
        const list = [[0.1]];
        expect(normalizeEmbeddingBody(list, false)).toBe(list);
    });

    test("an API-shaped embed body is returned by reference", () => {
        const body = { object: "list", data: [item], model: "m", usage: { total_tokens: 1 } };
        expect(normalizeEmbeddingBody(body, false)).toBe(body);
    });

    test("an API-shaped multimodal body is returned by reference", () => {
        const body = {
            object: "list",
            data: [item],
            model: "m",
            usage: { total_tokens: 1, text_tokens: 1, image_pixels: 0, video_pixels: 0 },
        };
        expect(normalizeEmbeddingBody(body, true)).toBe(body);
    });

    test("data that is not an array, and null items, are left alone", () => {
        const body = { object: "list", data: "weird", model: "m" };
        expect(normalizeEmbeddingBody(body, false)).toBe(body);
        const withNull = { object: "list", data: [null, item], model: "m" };
        expect(normalizeEmbeddingBody(withNull, false)).toBe(withNull);
    });

    test("bare arrays are wrapped with their position as index", () => {
        const out = normalizeEmbeddingBody({ object: "list", data: [[0.5], [0.6]], model: "m" }, false) as {
            data: unknown[];
        };
        expect(out.data).toEqual([
            { object: "embedding", embedding: [0.5], index: 0, text: null },
            { object: "embedding", embedding: [0.6], index: 1, text: null },
        ]);
    });

    test("items missing text get text: null without losing other fields", () => {
        const out = normalizeEmbeddingBody(
            { object: "list", data: [{ object: "embedding", embedding: [1], index: 4, extra: "kept" }], model: "m" },
            false,
        ) as { data: Array<Record<string, unknown>> };
        expect(out.data[0]).toEqual({ object: "embedding", embedding: [1], index: 4, extra: "kept", text: null });
    });

    test("multimodal usage keys are backfilled only when usage is an object", () => {
        const partial = { object: "list", data: [item], model: "m", usage: { total_tokens: 2, image_pixels: 9 } };
        const out = normalizeEmbeddingBody(partial, true) as { usage: Record<string, unknown> };
        expect(out.usage).toEqual({ total_tokens: 2, image_pixels: 9, text_tokens: 0, video_pixels: 0 });
        expect(partial.usage).toEqual({ total_tokens: 2, image_pixels: 9 });

        const stringUsage = { object: "list", data: [item], model: "m", usage: "n/a" };
        expect(normalizeEmbeddingBody(stringUsage, true)).toBe(stringUsage);
        const noUsage = { object: "list", data: [item], model: "m" };
        expect(normalizeEmbeddingBody(noUsage, true)).toBe(noUsage);
    });

    test("embed mode never touches usage", () => {
        const body = { object: "list", data: [item], model: "m", usage: { total_tokens: 2 } };
        expect(normalizeEmbeddingBody(body, false)).toBe(body);
    });

    test("telemetry stripping and item wrapping compose", () => {
        const out = normalizeEmbeddingBody(
            { object: "list", data: [[0.5]], model: "m", usage: { total_tokens: 1 }, total_embed_ms: 7 },
            false,
        ) as Record<string, unknown>;
        expect(Object.keys(out).sort()).toEqual(["data", "model", "object", "usage"]);
        expect(out.data).toEqual([{ object: "embedding", embedding: [0.5], index: 0, text: null }]);
    });
});
