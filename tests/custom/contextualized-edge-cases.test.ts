import { VoyageAIClient as Client } from "../../src/Client";
import { VoyageAIError } from "../../src/errors";

const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });

describe("contextualizedEmbed() edge cases", () => {
    // --- Basic structure ---

    test("single doc, multiple chunks returns nested response", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["chunk one", "chunk two", "chunk three"]],
            model: "voyage-context-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].data?.length).toBe(3);
        for (const chunk of result.data![0].data!) {
            expect(chunk.embedding!.length).toBeGreaterThan(0);
        }
    });

    test("multiple docs with varying chunk counts", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [
                ["doc1 chunk1", "doc1 chunk2"],
                ["doc2 chunk1", "doc2 chunk2", "doc2 chunk3"],
            ],
            model: "voyage-context-3",
        });
        expect(result.data?.length).toBe(2);
        expect(result.data![0].data?.length).toBe(2);
        expect(result.data![1].data?.length).toBe(3);
    });

    test("single doc, single chunk", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["only chunk"]],
            model: "voyage-context-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].data?.length).toBe(1);
    });

    test("many chunks (20) in one document", async () => {
        const chunks = Array.from({ length: 20 }, (_, i) => `Chunk number ${i + 1} with some content.`);
        const result = await client.contextualizedEmbed({
            inputs: [chunks],
            model: "voyage-context-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].data?.length).toBe(20);
    }, 30000);

    // --- outputDimension ---

    test.each([256, 512, 1024, 2048])("outputDimension %d", async (dim) => {
        const result = await client.contextualizedEmbed({
            inputs: [["test chunk"]],
            model: "voyage-context-3",
            outputDimension: dim,
        });
        expect(result.data![0].data![0].embedding!.length).toBe(dim);
    });

    test("invalid outputDimension (999) throws error", async () => {
        await expect(
            client.contextualizedEmbed({
                inputs: [["test"]],
                model: "voyage-context-3",
                outputDimension: 999,
            })
        ).rejects.toThrow(VoyageAIError);
    });

    // --- outputDtype ---

    test("outputDtype int8 produces integer values in [-128, 127]", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["test chunk"]],
            model: "voyage-context-3",
            outputDtype: "int8",
        });
        const emb = result.data![0].data![0].embedding!;
        for (const v of emb) {
            expect(v).toBeGreaterThanOrEqual(-128);
            expect(v).toBeLessThanOrEqual(127);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    test("outputDtype uint8 produces integer values in [0, 255]", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["test chunk"]],
            model: "voyage-context-3",
            outputDtype: "uint8",
        });
        const emb = result.data![0].data![0].embedding!;
        for (const v of emb) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(255);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    // --- inputType ---

    test("inputType query succeeds", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["search query chunk"]],
            model: "voyage-context-3",
            inputType: "query",
        });
        expect(result.data?.length).toBe(1);
    });

    test("inputType document succeeds", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["document chunk"]],
            model: "voyage-context-3",
            inputType: "document",
        });
        expect(result.data?.length).toBe(1);
    });

    // --- Error cases ---

    test("empty inputs array throws error", async () => {
        await expect(
            client.contextualizedEmbed({ inputs: [], model: "voyage-context-3" })
        ).rejects.toThrow(VoyageAIError);
    });

    // --- Nested response structure ---

    test("nested response structure has correct types", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["chunk a", "chunk b"], ["chunk c"]],
            model: "voyage-context-3",
        });
        expect(result.object).toBe("list");
        expect(result.model).toBe("voyage-context-3");
        expect(result.usage).toBeDefined();
        expect(typeof result.usage!.totalTokens).toBe("number");

        // data[0] is a document
        expect(result.data![0].object).toBe("list");
        expect(typeof result.data![0].index).toBe("number");

        // data[0].data[0] is a chunk embedding
        const chunkItem = result.data![0].data![0];
        expect(chunkItem.object).toBe("embedding");
        expect(typeof chunkItem.index).toBe("number");
        expect(Array.isArray(chunkItem.embedding)).toBe(true);
    });

    // --- Index ordering ---

    test("chunk indices are sequential within each document", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["a", "b", "c"], ["x", "y"]],
            model: "voyage-context-3",
        });
        for (const doc of result.data!) {
            doc.data!.forEach((chunk, i) => {
                expect(chunk.index).toBe(i);
            });
        }
    });

    test("document indices match input order", async () => {
        const result = await client.contextualizedEmbed({
            inputs: [["doc0 chunk"], ["doc1 chunk"], ["doc2 chunk"]],
            model: "voyage-context-3",
        });
        result.data!.forEach((doc, i) => {
            expect(doc.index).toBe(i);
        });
    });
});
