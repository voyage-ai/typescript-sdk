import { describe, expect, it } from "vitest";
import { VoyageAIClient } from "../../src/extended/ExtendedClient";

/**
 * Helper that creates a fetch function returning a canned JSON response
 * while capturing the outgoing request headers for assertions.
 */
function createCapturingFetch(responseBody: unknown): {
    fetch: typeof globalThis.fetch;
    getCapturedHeaders: () => Headers | undefined;
} {
    let capturedHeaders: Headers | undefined;
    const fakeFetch: typeof globalThis.fetch = async (_url, init) => {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    return { fetch: fakeFetch, getCapturedHeaders: () => capturedHeaders };
}

describe("client metadata headers on the wire", () => {
    it("sends only User-Agent and X-Voyage-Model by default", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        await client.embed({ input: "test", model: "voyage-3-large" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders).toBeDefined();
        expect(capturedHeaders!.get("user-agent")).toMatch(/^voyageai-typescript\/\d+\.\d+\.\d+$/);
        expect(capturedHeaders!.get("x-voyage-model")).toBe("voyage-3-large");
        expect(capturedHeaders!.get("x-voyage-wrapper")).toBeNull();
        expect(capturedHeaders!.get("x-voyage-lang")).toBeNull();
    });

    it("does not send X-Voyage-Wrapper when no wrappers are registered", async () => {
        const rerankResponse = {
            object: "list",
            data: [{ index: 0, relevance_score: 0.9, document: "doc" }],
            model: "rerank-2",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(rerankResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        await client.rerank({ query: "q", documents: ["doc"], model: "rerank-2" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders).toBeDefined();
        expect(capturedHeaders!.get("x-voyage-wrapper")).toBeNull();
    });

    it("sends X-Voyage-Wrapper after appendClientMetadata", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });

        await client.embed({ input: "test", model: "voyage-3-large" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders).toBeDefined();
        expect(capturedHeaders!.get("x-voyage-wrapper")).toBe("mem0/1.2.3");
    });

    it("user-provided headers are preserved alongside metadata headers", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
            headers: { "X-Custom-Header": "custom-value" },
        });

        await client.embed({ input: "test", model: "voyage-3-large" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders).toBeDefined();
        // metadata headers present
        expect(capturedHeaders!.get("user-agent")).toMatch(/^voyageai-typescript\//);
        // user header preserved
        expect(capturedHeaders!.get("x-custom-header")).toBe("custom-value");
    });

    it("chains multiple wrappers with pipe delimiter", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
        client.appendClientMetadata({ name: "llamaindex", version: "0.10.5" });
        await client.embed({ input: "test", model: "voyage-3-large" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders!.get("x-voyage-wrapper")).toBe("mem0/1.2.3|llamaindex/0.10.5");
    });

    it("is idempotent — same (name, version) is not duplicated", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
        await client.embed({ input: "test", model: "voyage-3-large" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders!.get("x-voyage-wrapper")).toBe("mem0/1.2.3");
    });

    it("user-provided User-Agent overrides metadata User-Agent", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            headers: { "User-Agent": "custom-agent/1.0" },
            fetch,
        });

        await client.embed({ input: "test", model: "voyage-3-large" });

        const capturedHeaders = getCapturedHeaders();
        expect(capturedHeaders!.get("user-agent")).toBe("custom-agent/1.0");
        // Other headers should still be present
        expect(capturedHeaders!.get("x-voyage-model")).toBe("voyage-3-large");
    });

    it("trims entries and dedupes on the trimmed name/version", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        client.appendClientMetadata({ name: " mem0 ", version: "1.2.3 " });
        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
        await client.embed({ input: "test", model: "voyage-3-large" });

        expect(getCapturedHeaders()!.get("x-voyage-wrapper")).toBe("mem0/1.2.3");
    });

    it("throws on invalid wrapper metadata and leaves the header unchanged", async () => {
        const embedResponse = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1], index: 0 }],
            model: "voyage-3-large",
            usage: { total_tokens: 5 },
        };
        const { fetch, getCapturedHeaders } = createCapturingFetch(embedResponse);

        const client = new VoyageAIClient({
            apiKey: "test-key",
            environment: "https://mock.test",
            maxRetries: 0,
            fetch,
        });

        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
        expect(() => client.appendClientMetadata({ name: "a|b", version: "1.0" })).toThrow(/invalid characters/);
        expect(() => client.appendClientMetadata({ name: "", version: "1.0" })).toThrow(
            "Wrapper name must be a non-empty string.",
        );
        await client.embed({ input: "test", model: "voyage-3-large" });

        expect(getCapturedHeaders()!.get("x-voyage-wrapper")).toBe("mem0/1.2.3");
    });

    describe("X-Voyage-Model", () => {
        const make = (body: unknown) => {
            const { fetch, getCapturedHeaders } = createCapturingFetch(body);
            const client = new VoyageAIClient({
                apiKey: "test-key",
                environment: "https://mock.test",
                maxRetries: 0,
                fetch,
            });
            return { client, getCapturedHeaders };
        };

        it("is sent on embed", async () => {
            const { client, getCapturedHeaders } = make({
                object: "list",
                data: [{ object: "embedding", embedding: [0.1], index: 0 }],
                model: "voyage-3-large",
                usage: { total_tokens: 5 },
            });
            await client.embed({ input: "test", model: "voyage-3-large" });
            expect(getCapturedHeaders()!.get("x-voyage-model")).toBe("voyage-3-large");
        });

        it("is sent on rerank", async () => {
            const { client, getCapturedHeaders } = make({
                object: "list",
                data: [{ index: 0, relevance_score: 0.9 }],
                model: "rerank-2",
                usage: { total_tokens: 5 },
            });
            await client.rerank({ query: "q", documents: ["d"], model: "rerank-2" });
            expect(getCapturedHeaders()!.get("x-voyage-model")).toBe("rerank-2");
        });

        it("is sent on multimodalEmbed", async () => {
            const { client, getCapturedHeaders } = make({
                object: "list",
                data: [{ object: "embedding", embedding: [0.1], index: 0 }],
                model: "voyage-multimodal-3",
                usage: { text_tokens: 1, image_pixels: 0, total_tokens: 1 },
            });
            await client.multimodalEmbed({
                inputs: [{ content: [{ type: "text", text: "hi" }] }],
                model: "voyage-multimodal-3",
            });
            expect(getCapturedHeaders()!.get("x-voyage-model")).toBe("voyage-multimodal-3");
        });

        it("is sent on contextualizedEmbed", async () => {
            const { client, getCapturedHeaders } = make({
                object: "list",
                data: [{ object: "list", data: [{ object: "embedding", embedding: [0.1], index: 0 }], index: 0 }],
                model: "voyage-context-3",
                usage: { total_tokens: 1 },
            });
            await client.contextualizedEmbed({
                inputs: [["a"]],
                inputType: "document",
                model: "voyage-context-3",
            });
            expect(getCapturedHeaders()!.get("x-voyage-model")).toBe("voyage-context-3");
        });

        it("always mirrors the body model, even if the caller passes the header", async () => {
            const { client, getCapturedHeaders } = make({
                object: "list",
                data: [{ object: "embedding", embedding: [0.1], index: 0 }],
                model: "voyage-3-large",
                usage: { total_tokens: 5 },
            });
            await client.embed({ input: "test", model: "voyage-3-large" }, { headers: { "X-Voyage-Model": "other" } });
            expect(getCapturedHeaders()!.get("x-voyage-model")).toBe("voyage-3-large");
        });

        it.each([[""], ["   "], [undefined]])("rejects model %j without sending a request", async (model) => {
            const { client, getCapturedHeaders } = make({});
            const error = "model is required and must be a non-empty string.";
            await expect(client.embed({ input: "t", model: model as unknown as string })).rejects.toThrow(error);
            await expect(
                client.rerank({ query: "q", documents: ["d"], model: model as unknown as string }),
            ).rejects.toThrow(error);
            await expect(
                client.multimodalEmbed({
                    inputs: [{ content: [{ type: "text", text: "hi" }] }],
                    model: model as unknown as string,
                }),
            ).rejects.toThrow(error);
            await expect(
                client.contextualizedEmbed({
                    inputs: [["a"]],
                    inputType: "document",
                    model: model as unknown as string,
                }),
            ).rejects.toThrow(error);
            expect(getCapturedHeaders()).toBeUndefined();
        });
    });
});
