import type { ContextualizedEmbedRequest } from "../../src/api/client/requests/ContextualizedEmbedRequest";
import { validateAndNormalizeContextualizedInputs } from "../../src/extended/ExtendedClient";

function makeRequest(overrides: Partial<ContextualizedEmbedRequest>): ContextualizedEmbedRequest {
    return { inputs: [["doc"]], model: "voyage-context-3", ...overrides };
}

describe("validateAndNormalizeContextualizedInputs", () => {
    // --- chunkSize / chunkOverlap without enableAutoChunking ---

    test("chunkSize without enableAutoChunking throws", () => {
        expect(() => validateAndNormalizeContextualizedInputs(makeRequest({ chunkSize: 512 }))).toThrow(
            "chunkSize and chunkOverlap require enableAutoChunking: true",
        );
    });

    test("chunkOverlap without enableAutoChunking throws", () => {
        expect(() => validateAndNormalizeContextualizedInputs(makeRequest({ chunkOverlap: 64 }))).toThrow(
            "chunkSize and chunkOverlap require enableAutoChunking: true",
        );
    });

    // --- chunkSize validation ---

    test("chunkSize < 1 throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({ enableAutoChunking: true, inputType: "document", chunkSize: 0 }),
            ),
        ).toThrow("chunkSize must be greater than or equal to 1");
    });

    test("chunkSize = 1 is valid", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({ enableAutoChunking: true, inputType: "document", chunkSize: 1 }),
        );
        expect(result.chunkSize).toBe(1);
    });

    // --- chunkOverlap validation ---

    test("chunkOverlap < 0 throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({ enableAutoChunking: true, inputType: "document", chunkSize: 100, chunkOverlap: -1 }),
            ),
        ).toThrow("chunkOverlap must be greater than or equal to 0");
    });

    test("chunkOverlap = 0 is valid", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({ enableAutoChunking: true, inputType: "document", chunkSize: 100, chunkOverlap: 0 }),
        );
        expect(result.chunkOverlap).toBe(0);
    });

    test("chunkOverlap >= chunkSize throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({ enableAutoChunking: true, inputType: "document", chunkSize: 100, chunkOverlap: 100 }),
            ),
        ).toThrow("chunkOverlap (100) must be less than chunkSize (100)");
    });

    test("chunkOverlap > chunkSize throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({ enableAutoChunking: true, inputType: "document", chunkSize: 50, chunkOverlap: 100 }),
            ),
        ).toThrow("chunkOverlap (100) must be less than chunkSize (50)");
    });

    test("chunkOverlap without chunkSize throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({ enableAutoChunking: true, inputType: "document", chunkOverlap: 10 }),
            ),
        ).toThrow("chunkOverlap requires chunkSize");
    });

    // --- empty inputs ---

    test("empty inputs array throws", () => {
        expect(() => validateAndNormalizeContextualizedInputs(makeRequest({ inputs: [] }))).toThrow(
            "inputs must not be empty",
        );
    });

    // --- flat string[] normalization ---

    test("flat string[] with enableAutoChunking normalizes to string[][]", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({ inputs: ["doc1", "doc2"], enableAutoChunking: true, inputType: "document" }),
        );
        expect(result.inputs).toEqual([["doc1"], ["doc2"]]);
    });

    test("flat string[] with inputType query normalizes to string[][]", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({ inputs: ["query1", "query2"], inputType: "query" }),
        );
        expect(result.inputs).toEqual([["query1"], ["query2"]]);
    });

    test("flat string[] without enableAutoChunking or inputType query throws", () => {
        expect(() => validateAndNormalizeContextualizedInputs(makeRequest({ inputs: ["doc1"] }))).toThrow(
            "Flat string[] inputs require enableAutoChunking: true or inputType: 'query'",
        );
    });

    test("flat string[] with inputType document but no enableAutoChunking throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(makeRequest({ inputs: ["doc1"], inputType: "document" })),
        ).toThrow("Flat string[] inputs require enableAutoChunking: true or inputType: 'query'");
    });

    // --- enableAutoChunking requires inputType document ---

    test("enableAutoChunking without inputType document throws", () => {
        expect(() => validateAndNormalizeContextualizedInputs(makeRequest({ enableAutoChunking: true }))).toThrow(
            "enableAutoChunking: true requires inputType: 'document'",
        );
    });

    test("enableAutoChunking with inputType query throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(makeRequest({ enableAutoChunking: true, inputType: "query" })),
        ).toThrow("enableAutoChunking: true requires inputType: 'document'");
    });

    // --- auto-chunking expects one string per document ---

    test("enableAutoChunking with multi-chunk document throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({
                    inputs: [["chunk1", "chunk2"]],
                    enableAutoChunking: true,
                    inputType: "document",
                }),
            ),
        ).toThrow("inputs[0] has 2 chunks; auto-chunking expects one string per document");
    });

    test("enableAutoChunking with empty document throws", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({
                    inputs: [[]],
                    enableAutoChunking: true,
                    inputType: "document",
                }),
            ),
        ).toThrow("inputs[0] has 0 chunks; auto-chunking expects one string per document");
    });

    test("enableAutoChunking error message includes correct index", () => {
        expect(() =>
            validateAndNormalizeContextualizedInputs(
                makeRequest({
                    inputs: [["ok"], ["a", "b", "c"]],
                    enableAutoChunking: true,
                    inputType: "document",
                }),
            ),
        ).toThrow("inputs[1] has 3 chunks; auto-chunking expects one string per document");
    });

    // --- valid auto-chunking configurations ---

    test("valid auto-chunking with nested inputs passes through", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({
                inputs: [["single doc text"]],
                enableAutoChunking: true,
                inputType: "document",
            }),
        );
        expect(result.inputs).toEqual([["single doc text"]]);
        expect(result.enableAutoChunking).toBe(true);
    });

    test("valid auto-chunking with chunkSize and chunkOverlap", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({
                inputs: [["doc"]],
                enableAutoChunking: true,
                inputType: "document",
                chunkSize: 1024,
                chunkOverlap: 128,
            }),
        );
        expect(result.chunkSize).toBe(1024);
        expect(result.chunkOverlap).toBe(128);
    });

    test("valid auto-chunking with chunkSize only (no overlap)", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({
                inputs: [["doc"]],
                enableAutoChunking: true,
                inputType: "document",
                chunkSize: 2048,
            }),
        );
        expect(result.chunkSize).toBe(2048);
        expect(result.chunkOverlap).toBeUndefined();
    });

    // --- passthrough for standard requests ---

    test("standard nested inputs without auto-chunking pass through unchanged", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({ inputs: [["chunk1", "chunk2"], ["chunk3"]] }),
        );
        expect(result.inputs).toEqual([["chunk1", "chunk2"], ["chunk3"]]);
    });

    test("preserves other request fields", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({
                inputs: [["doc"]],
                model: "voyage-context-3",
                outputDimension: 512,
                outputDtype: "int8",
            }),
        );
        expect(result.model).toBe("voyage-context-3");
        expect(result.outputDimension).toBe(512);
        expect(result.outputDtype).toBe("int8");
    });

    // --- multiple documents with auto-chunking ---

    test("multiple flat docs normalized correctly", () => {
        const result = validateAndNormalizeContextualizedInputs(
            makeRequest({
                inputs: ["doc1", "doc2", "doc3"],
                enableAutoChunking: true,
                inputType: "document",
            }),
        );
        expect(result.inputs).toEqual([["doc1"], ["doc2"], ["doc3"]]);
    });
});
