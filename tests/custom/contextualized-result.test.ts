import type { ContextualizedEmbedResponse } from "../../src/api/types/ContextualizedEmbedResponse";
import { buildContextualizedResult, defaultChunkFn } from "../../src/extended/ExtendedClient";

function makeResponse(overrides?: Partial<ContextualizedEmbedResponse>): ContextualizedEmbedResponse {
    return {
        object: "list",
        data: [
            {
                object: "list",
                data: [
                    { object: "embedding", embedding: [0.1, 0.2], index: 0 },
                    { object: "embedding", embedding: [0.3, 0.4], index: 1 },
                ],
                index: 0,
            },
        ],
        model: "voyage-context-3",
        usage: { totalTokens: 10 },
        ...overrides,
    };
}

describe("buildContextualizedResult", () => {
    test("extracts embeddings correctly from nested response", () => {
        const result = buildContextualizedResult(makeResponse());
        expect(result.results.length).toBe(1);
        expect(result.results[0].index).toBe(0);
        expect(result.results[0].embeddings).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
    });

    test("handles multiple documents", () => {
        const response = makeResponse({
            data: [
                { object: "list", data: [{ embedding: [1.0], index: 0 }], index: 0 },
                {
                    object: "list",
                    data: [
                        { embedding: [2.0], index: 0 },
                        { embedding: [3.0], index: 1 },
                    ],
                    index: 1,
                },
            ],
        });
        const result = buildContextualizedResult(response);
        expect(result.results.length).toBe(2);
        expect(result.results[0].embeddings).toEqual([[1.0]]);
        expect(result.results[1].embeddings).toEqual([[2.0], [3.0]]);
    });

    test("with client chunk texts (chunkFn path)", () => {
        const clientTexts = [["chunk A", "chunk B"]];
        const result = buildContextualizedResult(makeResponse(), clientTexts);
        expect(result.results[0].chunkTexts).toEqual(["chunk A", "chunk B"]);
        expect(result.chunkTexts).toEqual([["chunk A", "chunk B"]]);
    });

    test("with server chunk texts (auto-chunking path)", () => {
        const response = makeResponse({
            data: [
                {
                    object: "list",
                    data: [
                        { embedding: [0.1], index: 0, text: "server chunk 1" },
                        { embedding: [0.2], index: 1, text: "server chunk 2" },
                    ],
                    index: 0,
                },
            ],
        });
        const result = buildContextualizedResult(response);
        expect(result.results[0].chunkTexts).toEqual(["server chunk 1", "server chunk 2"]);
        expect(result.chunkTexts).toEqual([["server chunk 1", "server chunk 2"]]);
    });

    test("throws on partial server chunk texts within a doc", () => {
        const response = makeResponse({
            data: [
                {
                    object: "list",
                    data: [
                        { embedding: [0.1], index: 0, text: "has text" },
                        { embedding: [0.2], index: 1 },
                    ],
                    index: 0,
                },
            ],
        });
        expect(() => buildContextualizedResult(response)).toThrow(
            "inputs[0] returned a partial set of chunk texts; expected text on every chunk or none",
        );
    });

    test("throws on inconsistent chunk texts across docs (some have, some don't)", () => {
        const response = makeResponse({
            data: [
                {
                    object: "list",
                    data: [{ embedding: [0.1], index: 0, text: "has text" }],
                    index: 0,
                },
                {
                    object: "list",
                    data: [{ embedding: [0.2], index: 0 }],
                    index: 1,
                },
            ],
        });
        expect(() => buildContextualizedResult(response)).toThrow(
            "response returned chunk texts for some documents but not others; expected all-or-nothing",
        );
    });

    test("handles response with no chunk texts", () => {
        const result = buildContextualizedResult(makeResponse());
        expect(result.results[0].chunkTexts).toBeUndefined();
        expect(result.chunkTexts).toBeUndefined();
    });

    test("aggregates totalTokens", () => {
        const result = buildContextualizedResult(makeResponse({ usage: { totalTokens: 42 } }));
        expect(result.totalTokens).toBe(42);
    });

    test("totalTokens defaults to 0 when usage is missing", () => {
        const result = buildContextualizedResult(makeResponse({ usage: undefined }));
        expect(result.totalTokens).toBe(0);
    });

    test("extracts chunkerVersion", () => {
        const result = buildContextualizedResult(makeResponse({ chunkerVersion: "1.0.0" }));
        expect(result.chunkerVersion).toBe("1.0.0");
    });

    test("chunkerVersion is undefined when not present", () => {
        const result = buildContextualizedResult(makeResponse());
        expect(result.chunkerVersion).toBeUndefined();
    });

    test("rawResponse is attached", () => {
        const response = makeResponse();
        const result = buildContextualizedResult(response);
        expect(result.rawResponse).toBe(response);
    });

    test("handles empty data array", () => {
        const result = buildContextualizedResult(makeResponse({ data: [] }));
        expect(result.results).toEqual([]);
        expect(result.chunkTexts).toBeUndefined();
    });

    test("handles missing embedding gracefully", () => {
        const response = makeResponse({
            data: [{ object: "list", data: [{ index: 0 }], index: 0 }],
        });
        const result = buildContextualizedResult(response);
        expect(result.results[0].embeddings).toEqual([[]]);
    });

    test("all docs have server texts → chunkTexts is populated", () => {
        const response = makeResponse({
            data: [
                { object: "list", data: [{ embedding: [1], index: 0, text: "a" }], index: 0 },
                { object: "list", data: [{ embedding: [2], index: 0, text: "b" }], index: 1 },
            ],
        });
        const result = buildContextualizedResult(response);
        expect(result.chunkTexts).toEqual([["a"], ["b"]]);
    });

    test("no docs have server texts → chunkTexts is undefined", () => {
        const response = makeResponse({
            data: [
                { object: "list", data: [{ embedding: [1], index: 0 }], index: 0 },
                { object: "list", data: [{ embedding: [2], index: 0 }], index: 1 },
            ],
        });
        const result = buildContextualizedResult(response);
        expect(result.chunkTexts).toBeUndefined();
    });
});

describe("defaultChunkFn with overlap", () => {
    test("overlap=0 produces non-overlapping chunks", () => {
        const fn = defaultChunkFn(10, 0);
        const text = "hello world, this is a test";
        const chunks = fn(text);
        expect(chunks.join("")).toBe(text);
    });

    test("overlap>0 produces overlapping chunks", () => {
        const fn = defaultChunkFn(10, 3);
        const text = "hello world, this is a test of chunking";
        const chunks = fn(text);
        expect(chunks.length).toBeGreaterThan(1);
        for (let i = 1; i < chunks.length; i++) {
            const prevEnd = chunks[i - 1].slice(-3);
            const currStart = chunks[i].slice(0, 3);
            expect(currStart).toBe(prevEnd);
        }
    });

    test("overlap with single chunk returns unchanged", () => {
        const fn = defaultChunkFn(100, 10);
        expect(fn("short")).toEqual(["short"]);
    });

    test("first chunk is unaffected by overlap", () => {
        const fn = defaultChunkFn(10, 5);
        const noOverlap = defaultChunkFn(10, 0);
        const text = "abcdefghijklmnopqrstuvwxyz";
        expect(fn(text)[0]).toBe(noOverlap(text)[0]);
    });
});
