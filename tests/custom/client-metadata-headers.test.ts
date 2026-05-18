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
    it("sends X-VoyageAI-* headers with every request", async () => {
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
        expect(capturedHeaders!.get("x-voyageai-lang")).toBe("typescript");
        expect(capturedHeaders!.get("x-voyageai-package")).toBe("voyageai");
        expect(capturedHeaders!.get("x-voyageai-package-version")).toMatch(/^\d+\.\d+\.\d+$/);
        expect(capturedHeaders!.get("x-voyageai-runtime")).toBe("Node.js");
        expect(capturedHeaders!.get("x-voyageai-runtime-version")).toMatch(/^\d+\.\d+\.\d+$/);
        expect(capturedHeaders!.get("x-voyageai-os")).toMatch(/^(Linux|Darwin|Windows)$/);
        expect(capturedHeaders!.get("x-voyageai-telemetry-version")).toBe("1");
        expect(capturedHeaders!.get("user-agent")).toMatch(/^voyageai-typescript\//);
    });

    it("does not send X-VoyageAI-Wrapper when no wrappers are registered", async () => {
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
        expect(capturedHeaders!.get("x-voyageai-wrapper")).toBeNull();
    });

    it("sends X-VoyageAI-Wrapper after appendClientMetadata", async () => {
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
        expect(capturedHeaders!.get("x-voyageai-wrapper")).toBe("mem0/1.2.3");
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
        expect(capturedHeaders!.get("x-voyageai-lang")).toBe("typescript");
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
        expect(capturedHeaders!.get("x-voyageai-wrapper")).toBe("mem0/1.2.3|llamaindex/0.10.5");
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
        expect(capturedHeaders!.get("x-voyageai-wrapper")).toBe("mem0/1.2.3");
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
        // Other metadata headers should still be present
        expect(capturedHeaders!.get("x-voyageai-lang")).toBe("typescript");
    });
});
