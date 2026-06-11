import { defaultChunkFn, VoyageAIClient } from "../../src/extended/ExtendedClient";

const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY || "" });

describe("auto-chunking integration", () => {
    test("basic auto-chunking returns embeddings", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [
                ["This is a long document that should be chunked by the server into smaller pieces for embedding."],
            ],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        expect(result.results.length).toBe(1);
        expect(result.results[0].embeddings.length).toBeGreaterThanOrEqual(1);
        for (const emb of result.results[0].embeddings) {
            expect(emb.length).toBeGreaterThan(0);
        }
        expect(result.totalTokens).toBeGreaterThan(0);
    });

    test("auto-chunking with chunkSize and chunkOverlap", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["This is a document with custom chunk size and overlap settings for auto-chunking testing."]],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
            chunkSize: 512,
            chunkOverlap: 64,
        });
        expect(result.results.length).toBe(1);
        expect(result.results[0].embeddings.length).toBeGreaterThanOrEqual(1);
    });

    test("auto-chunking response includes chunkerVersion", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["Document text for chunker version test."]],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        if (result.chunkerVersion !== undefined) {
            expect(typeof result.chunkerVersion).toBe("string");
            expect(result.chunkerVersion.length).toBeGreaterThan(0);
        }
    });

    test("auto-chunking returns per-chunk text via chunkTexts", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["A short document to check that per-chunk text is returned by the server."]],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        if (result.chunkTexts !== undefined) {
            expect(result.chunkTexts.length).toBe(1);
            for (const text of result.chunkTexts[0]) {
                expect(typeof text).toBe("string");
                expect(text.length).toBeGreaterThan(0);
            }
        }
        if (result.results[0].chunkTexts !== undefined) {
            for (const text of result.results[0].chunkTexts) {
                expect(typeof text).toBe("string");
            }
        }
    });

    test("flat string[] inputs are normalized and auto-chunked", async () => {
        const result = await client.contextualizedEmbed({
            inputs: ["First document text.", "Second document text."],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        expect(result.results.length).toBe(2);
        for (const r of result.results) {
            expect(r.embeddings.length).toBeGreaterThanOrEqual(1);
        }
    });

    test("multiple documents with auto-chunking", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [
                ["Document one with auto-chunking."],
                ["Document two with auto-chunking."],
                ["Document three with auto-chunking."],
            ],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        expect(result.results.length).toBe(3);
    });

    test("without auto-chunking, response has no chunkerVersion", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["chunk one", "chunk two"]],
            model: "voyage-context-3",
        });
        expect(result.results.length).toBe(1);
        expect(result.results[0].embeddings.length).toBe(2);
        expect(result.chunkerVersion).toBeUndefined();
    });

    test("chunkFn splits documents client-side and result has chunkTexts", async () => {
        const splitOnSentence = (text: string) => text.split(/(?<=\.)\s+/);
        const result = await client.contextualizedEmbed({
            inputs: [["First sentence. Second sentence. Third sentence."]],
            model: "voyage-context-3",
            chunkFn: splitOnSentence,
        });
        expect(result.results.length).toBe(1);
        expect(result.results[0].embeddings.length).toBe(3);
        expect(result.chunkTexts).toEqual([["First sentence.", "Second sentence.", "Third sentence."]]);
        expect(result.results[0].chunkTexts).toEqual(["First sentence.", "Second sentence.", "Third sentence."]);
    });

    test("defaultChunkFn splits long document into chunks", async () => {
        const longDoc = "This is a test paragraph. ".repeat(200);
        const result = await client.contextualizedEmbed({
            inputs: [[longDoc]],
            model: "voyage-context-3",
            chunkFn: defaultChunkFn(512),
        });
        expect(result.results.length).toBe(1);
        expect(result.results[0].embeddings.length).toBeGreaterThan(1);
        expect(result.chunkTexts).toBeDefined();
        expect(result.chunkTexts!.length).toBe(1);
        expect(result.chunkTexts![0].length).toBeGreaterThan(1);
    });

    test("chunkFn with multiple documents", async () => {
        const splitOnSpace = (text: string) => text.split(/(?<= )/);
        const result = await client.contextualizedEmbed({
            inputs: [["hello world"], ["foo bar baz"]],
            model: "voyage-context-3",
            chunkFn: splitOnSpace,
        });
        expect(result.results.length).toBe(2);
        expect(result.results[0].embeddings.length).toBe(2);
        expect(result.results[1].embeddings.length).toBe(3);
    });

    test("rawResponse is accessible for advanced users", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["test chunk"]],
            model: "voyage-context-3",
        });
        expect(result.rawResponse).toBeDefined();
        expect(result.rawResponse.data).toBeDefined();
        expect(result.rawResponse.model).toBe("voyage-context-3");
    });
});
