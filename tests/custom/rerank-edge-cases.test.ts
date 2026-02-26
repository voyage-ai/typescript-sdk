import { VoyageAIClient as Client } from "../../src/Client";
import { VoyageAIError } from "../../src/errors";

const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });

const documents = [
    "The Mediterranean diet emphasizes fish, olive oil, and vegetables, believed to reduce chronic diseases.",
    "Photosynthesis in plants converts light energy into glucose and produces essential oxygen.",
    "20th-century innovations, from radios to smartphones, centered on electronic advancements.",
    "Rivers provide water, irrigation, and habitat for aquatic species, vital for ecosystems.",
    "Shakespeare's works, like 'Hamlet' and 'A Midsummer Night's Dream,' endure in literature.",
];

describe("rerank() edge cases", () => {
    // --- topK ---

    test("topK=1 returns single result", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
            topK: 1,
        });
        expect(result.data?.length).toBe(1);
    });

    test("topK greater than documents length returns all documents", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
            topK: 100,
        });
        expect(result.data?.length).toBe(documents.length);
    });

    test("topK omitted returns all documents", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
        });
        expect(result.data?.length).toBe(documents.length);
    });

    // --- returnDocuments ---

    test("returnDocuments true includes document field", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
            returnDocuments: true,
        });
        for (const item of result.data!) {
            expect(typeof item.document).toBe("string");
            expect(item.document!.length).toBeGreaterThan(0);
        }
    });

    test("returnDocuments false omits document field", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
            returnDocuments: false,
        });
        for (const item of result.data!) {
            expect(item.document).toBeUndefined();
        }
    });

    test("returnDocuments omitted omits document field", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
        });
        for (const item of result.data!) {
            expect(item.document).toBeUndefined();
        }
    });

    // --- Single document ---

    test("single document input", async () => {
        const result = await client.rerank({
            query: "food",
            documents: ["The Mediterranean diet is healthy."],
            model: "rerank-2",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].index).toBe(0);
    });

    // --- Empty / edge inputs ---

    test("empty query string", async () => {
        // API may return results or error; we just confirm no crash
        try {
            const result = await client.rerank({
                query: "",
                documents: ["Some document"],
                model: "rerank-2",
            });
            expect(result.data?.length).toBeGreaterThanOrEqual(0);
        } catch (e) {
            expect(e).toBeInstanceOf(VoyageAIError);
        }
    });

    test("empty string in documents array", async () => {
        try {
            const result = await client.rerank({
                query: "test",
                documents: ["valid doc", ""],
                model: "rerank-2",
            });
            expect(result.data?.length).toBe(2);
        } catch (e) {
            expect(e).toBeInstanceOf(VoyageAIError);
        }
    });

    test("empty documents array throws VoyageAIError", async () => {
        await expect(
            client.rerank({ query: "test", documents: [], model: "rerank-2" })
        ).rejects.toThrow(VoyageAIError);
    });

    // --- Unicode ---

    test("unicode query and documents", async () => {
        const result = await client.rerank({
            query: "日本語のテスト 🇯🇵",
            documents: ["日本語のドキュメント", "English document", "中文文档"],
            model: "rerank-2",
        });
        expect(result.data?.length).toBe(3);
    });

    // --- Relevance score validation ---

    test("all relevance scores are between 0 and 1", async () => {
        const result = await client.rerank({
            query: "Mediterranean diet",
            documents,
            model: "rerank-2",
        });
        for (const item of result.data!) {
            expect(item.relevanceScore).toBeGreaterThanOrEqual(0);
            expect(item.relevanceScore).toBeLessThanOrEqual(1);
        }
    });

    // --- Index preservation ---

    test("indices map to original array positions", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2",
            returnDocuments: true,
        });
        for (const item of result.data!) {
            expect(item.document).toBe(documents[item.index!]);
        }
    });

    // --- Truncation ---

    test("truncation true on overlong documents succeeds", async () => {
        const longDoc = "word ".repeat(50_000);
        const result = await client.rerank({
            query: "test",
            documents: [longDoc],
            model: "rerank-2",
            truncation: true,
        });
        expect(result.data?.length).toBe(1);
    }, 30000);

    test("truncation false on overlong documents throws error", async () => {
        const longDoc = "word ".repeat(50_000);
        await expect(
            client.rerank({
                query: "test",
                documents: [longDoc],
                model: "rerank-2",
                truncation: false,
            })
        ).rejects.toThrow(VoyageAIError);
    }, 30000);

    // --- Invalid model ---

    test("invalid model throws VoyageAIError", async () => {
        await expect(
            client.rerank({
                query: "test",
                documents: ["doc"],
                model: "not-a-real-model",
            })
        ).rejects.toThrow(VoyageAIError);
    });

    // --- Semantic correctness ---

    test("relevant document ranks higher than irrelevant", async () => {
        const result = await client.rerank({
            query: "What is photosynthesis?",
            documents: [
                "Shakespeare wrote many famous plays.",
                "Photosynthesis converts light energy into chemical energy in plants.",
            ],
            model: "rerank-2",
        });
        // First result should be the photosynthesis document (index 1)
        expect(result.data![0].index).toBe(1);
    });

    // --- Model variants ---

    test("rerank-2-lite returns results", async () => {
        const result = await client.rerank({
            query: "Mediterranean food",
            documents,
            model: "rerank-2-lite",
        });
        expect(result.model).toBe("rerank-2-lite");
        expect(result.data?.length).toBe(documents.length);
    });
});
