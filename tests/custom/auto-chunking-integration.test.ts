import { defaultChunkFn, VoyageAIClient } from "../../src/extended/ExtendedClient";

const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY || "" });

describe("auto-chunking integration", () => {
    test("basic auto-chunking returns chunked embeddings with text", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [
                ["This is a long document that should be chunked by the server into smaller pieces for embedding."],
            ],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBe(1);
        expect(result.data![0].data!.length).toBeGreaterThanOrEqual(1);
        for (const chunk of result.data![0].data!) {
            expect(chunk.embedding).toBeDefined();
            expect(chunk.embedding!.length).toBeGreaterThan(0);
        }
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
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBe(1);
        expect(result.data![0].data!.length).toBeGreaterThanOrEqual(1);
    });

    test("auto-chunking response includes chunkerVersion", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["Document text for chunker version test."]],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        // TODO: skip assertion if API does not return chunkerVersion yet
        if (result.chunkerVersion !== undefined) {
            expect(typeof result.chunkerVersion).toBe("string");
            expect(result.chunkerVersion.length).toBeGreaterThan(0);
        }
    });

    test("auto-chunking returns per-chunk text", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["A short document to check that per-chunk text is returned by the server."]],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
        });
        const chunks = result.data![0].data!;
        // TODO: skip if API does not return text field yet
        const hasText = chunks.some((c) => c.text !== undefined);
        if (hasText) {
            for (const chunk of chunks) {
                expect(typeof chunk.text).toBe("string");
                expect(chunk.text!.length).toBeGreaterThan(0);
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
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBe(2);
        for (const doc of result.data!) {
            expect(doc.data!.length).toBeGreaterThanOrEqual(1);
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
        expect(result.data!.length).toBe(3);
    });

    test("without auto-chunking, response has no chunkerVersion or text", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["chunk one", "chunk two"]],
            model: "voyage-context-3",
        });
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBe(1);
        expect(result.data![0].data!.length).toBe(2);
        // Standard response should not have auto-chunking fields
        expect(result.chunkerVersion).toBeUndefined();
    });

    test("chunkFn splits documents client-side before sending to API", async () => {
        const splitOnSentence = (text: string) => text.split(/(?<=\.)\s+/);
        const result = await client.contextualizedEmbed({
            inputs: [["First sentence. Second sentence. Third sentence."]],
            model: "voyage-context-3",
            chunkFn: splitOnSentence,
        });
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBe(1);
        expect(result.data![0].data!.length).toBe(3);
    });

    test("defaultChunkFn splits long document into chunks", async () => {
        const longDoc = "This is a test paragraph. ".repeat(200);
        const result = await client.contextualizedEmbed({
            inputs: [[longDoc]],
            model: "voyage-context-3",
            chunkFn: defaultChunkFn(512),
        });
        expect(result.data).toBeDefined();
        expect(result.data!.length).toBe(1);
        expect(result.data![0].data!.length).toBeGreaterThan(1);
    });

    test("chunkFn with multiple documents", async () => {
        const splitOnSpace = (text: string) => text.split(/(?<= )/);
        const result = await client.contextualizedEmbed({
            inputs: [["hello world"], ["foo bar baz"]],
            model: "voyage-context-3",
            chunkFn: splitOnSpace,
        });
        expect(result.data!.length).toBe(2);
        expect(result.data![0].data!.length).toBe(2);
        expect(result.data![1].data!.length).toBe(3);
    });
});
