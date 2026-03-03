/**
 * Tests for the tokenize() method on VoyageAIClient.
 * Tokenization runs locally via @huggingface/transformers — no API key required.
 */

// Gracefully skip if @huggingface/transformers is not installed
let transformersAvailable = false;
try {
    require.resolve("@huggingface/transformers");
    transformersAvailable = true;
} catch {}

const describeIfTransformers = transformersAvailable ? describe : describe.skip;

describeIfTransformers("client.tokenize()", () => {
    let VoyageAIClient: any;
    let client: any;

    beforeAll(async () => {
        const mod = await import("../../src/extended/ExtendedClient");
        VoyageAIClient = mod.VoyageAIClient;
        client = new VoyageAIClient({ apiKey: "not-needed" });
    });

    test("tokenizes a single text with local model", async () => {
        const results = await client.tokenize(["hello world"], "voyage-4-nano");

        expect(results).toHaveLength(1);
        expect(results[0].tokens).toBeInstanceOf(Array);
        expect(results[0].ids).toBeInstanceOf(Array);
        expect(results[0].tokens.length).toBeGreaterThan(0);
        expect(results[0].tokens.length).toBe(results[0].ids.length);
        results[0].tokens.forEach((t: unknown) => expect(typeof t).toBe("string"));
        results[0].ids.forEach((id: unknown) => expect(typeof id).toBe("number"));
    }, 60000);

    test("tokenizes multiple texts", async () => {
        const results = await client.tokenize(["hello", "hello world foo"], "voyage-4-nano");

        expect(results).toHaveLength(2);
        expect(results[0].ids.length).toBeLessThan(results[1].ids.length);
    }, 60000);

    test("empty texts array returns empty array", async () => {
        const results = await client.tokenize([], "voyage-4-nano");
        expect(results).toEqual([]);
    });

    test("works with API model (voyage-3-large)", async () => {
        const results = await client.tokenize(["hello world"], "voyage-3-large");

        expect(results).toHaveLength(1);
        expect(results[0].tokens.length).toBeGreaterThan(0);
        expect(results[0].ids.length).toBe(results[0].tokens.length);
    }, 60000);

    test("tokenizer is cached across calls", async () => {
        const r1 = await client.tokenize(["test"], "voyage-4-nano");
        const r2 = await client.tokenize(["test"], "voyage-4-nano");

        expect(r1).toEqual(r2);
    }, 60000);

    test("ids round-trip: same text produces same ids", async () => {
        const [a] = await client.tokenize(["The quick brown fox"], "voyage-4-nano");
        const [b] = await client.tokenize(["The quick brown fox"], "voyage-4-nano");

        expect(a.ids).toEqual(b.ids);
        expect(a.tokens).toEqual(b.tokens);
    }, 60000);
});
