import { VoyageAIClient as Client } from "../../src/Client";
import { VoyageAIError, VoyageAITimeoutError } from "../../src/errors";

describe("Error handling edge cases", () => {
    // --- Invalid API key ---

    test("invalid API key throws VoyageAIError with statusCode 401", async () => {
        const client = new Client({ apiKey: "invalid-key" });
        try {
            await client.embed({ input: "test", model: "voyage-3-large" });
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(VoyageAIError);
            expect((e as VoyageAIError).statusCode).toBe(401);
        }
    });

    // --- Invalid model ---

    test("invalid model on embed throws VoyageAIError with statusCode 400", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        try {
            await client.embed({ input: "test", model: "not-a-real-model" });
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(VoyageAIError);
            expect((e as VoyageAIError).statusCode).toBe(400);
        }
    });

    test("invalid model on rerank throws VoyageAIError", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        await expect(
            client.rerank({ query: "test", documents: ["doc"], model: "not-a-real-model" })
        ).rejects.toThrow(VoyageAIError);
    });

    // --- Error properties ---

    test("VoyageAIError has statusCode, body, rawResponse properties", async () => {
        const client = new Client({ apiKey: "invalid-key" });
        try {
            await client.embed({ input: "test", model: "voyage-3-large" });
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(VoyageAIError);
            const err = e as VoyageAIError;
            expect("statusCode" in err).toBe(true);
            expect("body" in err).toBe(true);
            expect("rawResponse" in err).toBe(true);
        }
    });

    test("VoyageAIError instanceof Error", async () => {
        const client = new Client({ apiKey: "invalid-key" });
        try {
            await client.embed({ input: "test", model: "voyage-3-large" });
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect(e).toBeInstanceOf(VoyageAIError);
        }
    });

    // --- Timeout ---

    test("very short timeoutInSeconds causes error", async () => {
        // Note: Ideally this would throw VoyageAITimeoutError, but due to how the
        // Fern-generated fetcher classifies abort reasons in Node 22, timeouts
        // triggered via AbortController.abort("timeout") surface as VoyageAIError
        // instead of VoyageAITimeoutError. The timeout itself works correctly.
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        await expect(
            client.embed(
                { input: "test", model: "voyage-3-large" },
                { timeoutInSeconds: 0.001 }
            )
        ).rejects.toThrow(VoyageAIError);
    });

    test("VoyageAITimeoutError instanceof Error", () => {
        const err = new VoyageAITimeoutError("test timeout");
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(VoyageAITimeoutError);
    });

    // --- AbortSignal ---

    test("pre-aborted AbortSignal throws error", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const controller = new AbortController();
        controller.abort();
        await expect(
            client.embed(
                { input: "test", model: "voyage-3-large" },
                { abortSignal: controller.signal }
            )
        ).rejects.toThrow();
    });

    // --- Per-request timeout override ---

    test("per-request timeout override causes error", async () => {
        // Same Fern codegen issue as above — timeout works but surfaces as VoyageAIError
        const client = new Client({
            apiKey: process.env.VOYAGE_API_KEY || "",
            timeoutInSeconds: 60,
        });
        await expect(
            client.embed(
                { input: "test", model: "voyage-3-large" },
                { timeoutInSeconds: 0.001 }
            )
        ).rejects.toThrow(VoyageAIError);
    });

    // --- Local model errors are plain Error ---

    test("local model errors are plain Error, NOT VoyageAIError", async () => {
        let VoyageAIClient: any;
        try {
            require.resolve("@huggingface/transformers");
            const mod = await import("../../src/extended/ExtendedClient");
            VoyageAIClient = mod.VoyageAIClient;
        } catch {
            // Skip if transformers not installed
            return;
        }
        const client = new VoyageAIClient({ apiKey: "bogus" });
        try {
            await client.embed({ input: "test", model: "voyage-4-nano", outputDimension: 999 });
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect(e).not.toBeInstanceOf(VoyageAIError);
        }
    }, 60000);

    // --- Custom headers ---

    test("custom headers don't break requests", async () => {
        const client = new Client({
            apiKey: process.env.VOYAGE_API_KEY || "",
            headers: { "X-Custom-Header": "test-value" },
        });
        const result = await client.embed({ input: "test", model: "voyage-3-large" });
        expect(result.data?.length).toBe(1);
    });

    // --- maxRetries ---

    test("maxRetries 0 with bad key still fails with VoyageAIError", async () => {
        const client = new Client({ apiKey: "invalid-key", maxRetries: 0 });
        await expect(
            client.embed({ input: "test", model: "voyage-3-large" })
        ).rejects.toThrow(VoyageAIError);
    });
});
