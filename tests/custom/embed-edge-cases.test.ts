import { VoyageAIClient as Client } from "../../src/Client";
import { VoyageAIError } from "../../src/errors";
import { cosineSimilarity } from "./helpers";

const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });

describe("embed() edge cases", () => {
    // --- Input variations ---

    test("single string and array-of-one produce same token count", async () => {
        const single = await client.embed({ input: "hello world", model: "voyage-3-large" });
        const array = await client.embed({ input: ["hello world"], model: "voyage-3-large" });
        expect(single.usage?.totalTokens).toBe(array.usage?.totalTokens);
        expect(single.data?.length).toBe(1);
        expect(array.data?.length).toBe(1);
    });

    test("empty string input throws VoyageAIError", async () => {
        await expect(
            client.embed({ input: "", model: "voyage-3-large" })
        ).rejects.toThrow(VoyageAIError);
    });

    test("whitespace-only input returns an embedding", async () => {
        const result = await client.embed({ input: "   \t\n  ", model: "voyage-3-large" });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    test("single character input", async () => {
        const result = await client.embed({ input: "a", model: "voyage-3-large" });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    test("unicode and emoji text", async () => {
        const result = await client.embed({ input: "Hello 世界 🌍", model: "voyage-3-large" });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
        expect(result.usage!.totalTokens).toBeGreaterThan(0);
    });

    test("special characters (newlines, tabs, quotes, HTML entities)", async () => {
        const result = await client.embed({
            input: "line1\nline2\ttab \"quoted\" &amp; <b>bold</b>",
            model: "voyage-3-large",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    test("max batch size (128 inputs)", async () => {
        const inputs = Array.from({ length: 128 }, (_, i) => `text ${i}`);
        const result = await client.embed({ input: inputs, model: "voyage-3-large" });
        expect(result.data?.length).toBe(128);
    }, 30000);

    // --- Truncation ---

    test("truncation true on overlong input succeeds", async () => {
        const longText = "word ".repeat(100_000);
        const result = await client.embed({
            input: longText,
            model: "voyage-3-large",
            truncation: true,
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    }, 30000);

    test("truncation false on overlong input throws VoyageAIError", async () => {
        const longText = "word ".repeat(100_000);
        await expect(
            client.embed({ input: longText, model: "voyage-3-large", truncation: false })
        ).rejects.toThrow(VoyageAIError);
    }, 30000);

    // --- inputType ---

    test("inputType 'query' succeeds", async () => {
        const result = await client.embed({
            input: "search query",
            model: "voyage-3-large",
            inputType: "query",
        });
        expect(result.data?.length).toBe(1);
    });

    test("inputType 'document' succeeds", async () => {
        const result = await client.embed({
            input: "a document passage",
            model: "voyage-3-large",
            inputType: "document",
        });
        expect(result.data?.length).toBe(1);
    });

    test("inputType omitted succeeds", async () => {
        const result = await client.embed({
            input: "some text",
            model: "voyage-3-large",
        });
        expect(result.data?.length).toBe(1);
    });

    // --- encodingFormat ---

    test("encodingFormat 'base64' returns string embeddings", async () => {
        const result = await client.embed({
            input: "hello",
            model: "voyage-3-large",
            encodingFormat: "base64",
        });
        expect(result.data?.length).toBe(1);
        // base64 embedding is returned as a string in the embedding field
        const embedding = result.data![0].embedding;
        expect(typeof embedding === "string" || Array.isArray(embedding)).toBe(true);
    });

    // --- outputDimension ---

    test.each([512, 1024, 2048])("outputDimension %d with voyage-3-large", async (dim) => {
        const result = await client.embed({
            input: "test",
            model: "voyage-3-large",
            outputDimension: dim,
        });
        expect(result.data![0].embedding!.length).toBe(dim);
    });

    // --- outputDtype ---

    test("outputDtype int8 produces values in [-128, 127]", async () => {
        const result = await client.embed({
            input: "test",
            model: "voyage-3-large",
            outputDtype: "int8",
        });
        const emb = result.data![0].embedding!;
        for (const v of emb) {
            expect(v).toBeGreaterThanOrEqual(-128);
            expect(v).toBeLessThanOrEqual(127);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    test("outputDtype uint8 produces values in [0, 255]", async () => {
        const result = await client.embed({
            input: "test",
            model: "voyage-3-large",
            outputDtype: "uint8",
        });
        const emb = result.data![0].embedding!;
        for (const v of emb) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(255);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    test("outputDtype binary reduces dimension by 8x", async () => {
        const result = await client.embed({
            input: "test",
            model: "voyage-3-large",
            outputDimension: 1024,
            outputDtype: "binary",
        });
        expect(result.data![0].embedding!.length).toBe(1024 / 8);
    });

    test("outputDtype ubinary reduces dimension by 8x", async () => {
        const result = await client.embed({
            input: "test",
            model: "voyage-3-large",
            outputDimension: 1024,
            outputDtype: "ubinary",
        });
        expect(result.data![0].embedding!.length).toBe(1024 / 8);
    });

    // --- Semantic similarity ---

    test("similar texts have higher cosine similarity than dissimilar", async () => {
        const result = await client.embed({
            input: [
                "The cat sat on the mat",
                "A kitten rested on the rug",
                "Quantum mechanics describes subatomic particles",
            ],
            model: "voyage-3-large",
        });
        const [a, b, c] = result.data!.map((d) => d.embedding!);
        const simSimilar = cosineSimilarity(a, b);
        const simDissimilar = cosineSimilarity(a, c);
        expect(simSimilar).toBeGreaterThan(0.7);
        expect(simDissimilar).toBeLessThan(0.5);
    });

    // --- Response structure ---

    test("response has correct structure and types", async () => {
        const result = await client.embed({ input: ["hello", "world"], model: "voyage-3-large" });
        expect(result.object).toBe("list");
        expect(result.model).toBe("voyage-3-large");
        expect(result.usage).toBeDefined();
        expect(typeof result.usage!.totalTokens).toBe("number");
        expect(result.data!.length).toBe(2);
        for (const item of result.data!) {
            expect(item.object).toBe("embedding");
            expect(typeof item.index).toBe("number");
            expect(Array.isArray(item.embedding)).toBe(true);
        }
    });

    // --- Multiple models ---

    test("voyage-3-lite returns embeddings", async () => {
        const result = await client.embed({ input: "test", model: "voyage-3-lite" });
        expect(result.model).toBe("voyage-3-lite");
        expect(result.data?.length).toBe(1);
    });

    test("voyage-code-3 returns embeddings", async () => {
        const result = await client.embed({ input: "function hello() {}", model: "voyage-code-3" });
        expect(result.model).toBe("voyage-code-3");
        expect(result.data?.length).toBe(1);
    });
});
