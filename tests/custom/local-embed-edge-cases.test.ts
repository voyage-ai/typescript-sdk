import { assertNormalized } from "./helpers";

// Gracefully skip entire suite if @huggingface/transformers is not installed
let transformersAvailable = false;
try {
    require.resolve("@huggingface/transformers");
    transformersAvailable = true;
} catch {}

const describeIfTransformers = transformersAvailable ? describe : describe.skip;

describeIfTransformers("voyage-4-nano local model edge cases", () => {
    // Lazy import to avoid crash when transformers not installed
    let VoyageAIClient: any;

    beforeAll(async () => {
        const mod = await import("../../src/extended/ExtendedClient");
        VoyageAIClient = mod.VoyageAIClient;
    });

    const makeClient = () => new VoyageAIClient({ apiKey: "bogus-key-not-used" });

    // --- Basic embedding ---

    test("basic embed returns 2048 dims by default", async () => {
        const client = makeClient();
        const result = await client.embed({ input: "hello world", model: "voyage-4-nano" });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBe(2048);
    }, 60000);

    test("batch input (3 strings) returns 3 embeddings", async () => {
        const client = makeClient();
        const result = await client.embed({
            input: ["hello", "world", "test"],
            model: "voyage-4-nano",
        });
        expect(result.data?.length).toBe(3);
    }, 60000);

    test("single-element array", async () => {
        const client = makeClient();
        const result = await client.embed({
            input: ["only one"],
            model: "voyage-4-nano",
        });
        expect(result.data?.length).toBe(1);
    }, 60000);

    // --- Matryoshka dimensions ---

    test.each([2048, 1024, 512, 256])("outputDimension %d", async (dim) => {
        const client = makeClient();
        const result = await client.embed({
            input: "test",
            model: "voyage-4-nano",
            outputDimension: dim,
        });
        expect(result.data![0].embedding!.length).toBe(dim);
    }, 60000);

    // --- L2 normalization ---

    test.each([2048, 1024, 512, 256])("L2 norm ≈ 1.0 for dimension %d", async (dim) => {
        const client = makeClient();
        const result = await client.embed({
            input: "normalization test",
            model: "voyage-4-nano",
            outputDimension: dim,
        });
        assertNormalized(result.data![0].embedding!);
    }, 60000);

    // --- Deterministic ---

    test("same input produces identical output", async () => {
        const client = makeClient();
        const r1 = await client.embed({ input: "deterministic", model: "voyage-4-nano" });
        const r2 = await client.embed({ input: "deterministic", model: "voyage-4-nano" });
        expect(r1.data![0].embedding).toEqual(r2.data![0].embedding);
    }, 60000);

    // --- String vs array equivalence ---

    test("string vs [string] produces same embedding", async () => {
        const client = makeClient();
        const r1 = await client.embed({ input: "equivalent", model: "voyage-4-nano" });
        const r2 = await client.embed({ input: ["equivalent"], model: "voyage-4-nano" });
        expect(r1.data![0].embedding).toEqual(r2.data![0].embedding);
    }, 60000);

    // --- Token counting ---

    test("token count > 0 for 'hello world'", async () => {
        const client = makeClient();
        const result = await client.embed({ input: "hello world", model: "voyage-4-nano" });
        expect(result.usage!.totalTokens).toBeGreaterThan(0);
    }, 60000);

    test("token sum across batch >= individual sums", async () => {
        const client = makeClient();
        const batch = await client.embed({
            input: ["hello world", "foo bar baz"],
            model: "voyage-4-nano",
        });
        const r1 = await client.embed({ input: "hello world", model: "voyage-4-nano" });
        const r2 = await client.embed({ input: "foo bar baz", model: "voyage-4-nano" });
        expect(batch.usage!.totalTokens).toBe(r1.usage!.totalTokens + r2.usage!.totalTokens);
    }, 60000);

    // --- Silently ignores unsupported params ---

    test("silently ignores inputType parameter", async () => {
        const client = makeClient();
        const result = await client.embed({
            input: "test",
            model: "voyage-4-nano",
            inputType: "query",
        });
        expect(result.data?.length).toBe(1);
    }, 60000);

    test("silently ignores truncation parameter", async () => {
        const client = makeClient();
        const result = await client.embed({
            input: "test",
            model: "voyage-4-nano",
            truncation: false,
        });
        expect(result.data?.length).toBe(1);
    }, 60000);

    test("silently ignores encodingFormat parameter (returns number[])", async () => {
        const client = makeClient();
        const result = await client.embed({
            input: "test",
            model: "voyage-4-nano",
            encodingFormat: "base64",
        });
        expect(result.data?.length).toBe(1);
        expect(Array.isArray(result.data![0].embedding)).toBe(true);
        expect(typeof result.data![0].embedding![0]).toBe("number");
    }, 60000);

    // --- Invalid dimensions ---

    test("invalid dimension (128) throws Error", async () => {
        const client = makeClient();
        await expect(
            client.embed({ input: "test", model: "voyage-4-nano", outputDimension: 128 })
        ).rejects.toThrow(Error);
        await expect(
            client.embed({ input: "test", model: "voyage-4-nano", outputDimension: 128 })
        ).rejects.not.toThrow(expect.objectContaining({ name: "VoyageAIError" }));
    }, 60000);

    test("invalid dimension (0) throws Error", async () => {
        const client = makeClient();
        await expect(
            client.embed({ input: "test", model: "voyage-4-nano", outputDimension: 0 })
        ).rejects.toThrow(Error);
    }, 60000);

    // --- Invalid outputDtype ---

    test("invalid outputDtype ('float16') throws Error", async () => {
        const client = makeClient();
        await expect(
            client.embed({ input: "test", model: "voyage-4-nano", outputDtype: "float16" as any })
        ).rejects.toThrow(Error);
    }, 60000);

    // --- Empty string ---

    test("empty string throws Error (ONNX cannot process zero tokens)", async () => {
        const client = makeClient();
        await expect(
            client.embed({ input: "", model: "voyage-4-nano" })
        ).rejects.toThrow(Error);
    }, 60000);

    // --- Long text ---

    test("long text (5000 words) produces an embedding", async () => {
        const client = makeClient();
        const longText = "word ".repeat(5000);
        const result = await client.embed({ input: longText, model: "voyage-4-nano" });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBe(2048);
    }, 120000);

    // --- Response structure ---

    test("response structure: object, data[], model, usage.totalTokens", async () => {
        const client = makeClient();
        const result = await client.embed({ input: "test", model: "voyage-4-nano" });
        expect(result.object).toBe("list");
        expect(result.model).toBe("voyage-4-nano");
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data![0].object).toBe("embedding");
        expect(typeof result.data![0].index).toBe("number");
        expect(Array.isArray(result.data![0].embedding)).toBe(true);
        expect(typeof result.usage!.totalTokens).toBe("number");
    }, 60000);

    // --- No API call ---

    test("works with bogus apiKey (no API call made)", async () => {
        const client = new VoyageAIClient({ apiKey: "this-is-not-a-valid-key" });
        const result = await client.embed({ input: "test", model: "voyage-4-nano" });
        expect(result.data?.length).toBe(1);
    }, 60000);
});
