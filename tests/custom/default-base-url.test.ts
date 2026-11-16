import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getDefaultBaseUrl,
    MONGODB_ATLAS_BASE_URL,
    VOYAGE_API_BASE_URL,
    VoyageAIClient,
    VoyageAIEnvironment,
} from "../../src/extended/index";

const EMBED_RESPONSE = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1], index: 0 }],
    model: "voyage-3-large",
    usage: { total_tokens: 1 },
};

interface Captured {
    url: string;
    authorization: string | null;
}

function capturingFetch(captured: Captured[]): typeof globalThis.fetch {
    return async (url, init) => {
        captured.push({
            url: String(url),
            authorization: new Headers(init?.headers as HeadersInit).get("authorization"),
        });
        return new Response(JSON.stringify(EMBED_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
}

async function embedAndCapture(options: ConstructorParameters<typeof VoyageAIClient>[0]): Promise<Captured> {
    const captured: Captured[] = [];
    const client = new VoyageAIClient({ ...options, fetch: capturingFetch(captured) });
    await client.embed({ input: "hi", model: "voyage-3-large" });
    expect(captured).toHaveLength(1);
    return captured[0];
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("getDefaultBaseUrl", () => {
    it("routes Voyage AI keys to the Voyage AI API", () => {
        expect(getDefaultBaseUrl("pa-abc")).toBe("https://api.voyageai.com/v1");
    });

    it("routes MongoDB Atlas keys to ai.mongodb.com", () => {
        expect(getDefaultBaseUrl("al-abc")).toBe("https://ai.mongodb.com/v1");
    });

    it("only treats a leading al- as the Atlas prefix", () => {
        expect(getDefaultBaseUrl("pa-al-abc")).toBe(VOYAGE_API_BASE_URL);
        expect(getDefaultBaseUrl("AL-abc")).toBe(VOYAGE_API_BASE_URL);
        expect(getDefaultBaseUrl("")).toBe(VOYAGE_API_BASE_URL);
    });

    it("keeps the Voyage AI URL in step with the generated default environment", () => {
        expect(VOYAGE_API_BASE_URL).toBe(VoyageAIEnvironment.Default);
        expect(MONGODB_ATLAS_BASE_URL).toBe("https://ai.mongodb.com/v1");
    });
});

describe("default base URL on the extended client", () => {
    it("sends an al- apiKey option to ai.mongodb.com with the same key as bearer token", async () => {
        const request = await embedAndCapture({ apiKey: "al-atlas-key" });
        expect(request.url).toBe("https://ai.mongodb.com/v1/embeddings");
        expect(request.authorization).toBe("Bearer al-atlas-key");
    });

    it("sends a pa- apiKey option to api.voyageai.com", async () => {
        const request = await embedAndCapture({ apiKey: "pa-voyage-key" });
        expect(request.url).toBe("https://api.voyageai.com/v1/embeddings");
        expect(request.authorization).toBe("Bearer pa-voyage-key");
    });

    it("routes an al- key from VOYAGE_API_KEY to ai.mongodb.com", async () => {
        vi.stubEnv("VOYAGE_API_KEY", "al-env-key");
        const request = await embedAndCapture({});
        expect(request.url).toBe("https://ai.mongodb.com/v1/embeddings");
        expect(request.authorization).toBe("Bearer al-env-key");
    });

    it("routes a pa- key from VOYAGE_API_KEY to api.voyageai.com", async () => {
        vi.stubEnv("VOYAGE_API_KEY", "pa-env-key");
        const request = await embedAndCapture({});
        expect(request.url).toBe("https://api.voyageai.com/v1/embeddings");
    });

    it("prefers the apiKey option over VOYAGE_API_KEY", async () => {
        vi.stubEnv("VOYAGE_API_KEY", "pa-env-key");
        const request = await embedAndCapture({ apiKey: "al-option-key" });
        expect(request.url).toBe("https://ai.mongodb.com/v1/embeddings");
        expect(request.authorization).toBe("Bearer al-option-key");
    });

    it("resolves a function apiKey supplier", async () => {
        const request = await embedAndCapture({ apiKey: () => "al-supplied-key" });
        expect(request.url).toBe("https://ai.mongodb.com/v1/embeddings");
        expect(request.authorization).toBe("Bearer al-supplied-key");
    });

    it("resolves an async apiKey supplier", async () => {
        const request = await embedAndCapture({ apiKey: async () => "al-async-key" });
        expect(request.url).toBe("https://ai.mongodb.com/v1/embeddings");
    });

    it("follows a rotated key on the next request", async () => {
        let key = "pa-first";
        const captured: Captured[] = [];
        const client = new VoyageAIClient({ apiKey: () => key, fetch: capturingFetch(captured) });

        await client.embed({ input: "hi", model: "voyage-3-large" });
        key = "al-second";
        await client.embed({ input: "hi", model: "voyage-3-large" });

        expect(captured.map((request) => request.url)).toEqual([
            "https://api.voyageai.com/v1/embeddings",
            "https://ai.mongodb.com/v1/embeddings",
        ]);
    });

    it("lets an explicit baseUrl win over an al- key", async () => {
        const request = await embedAndCapture({ apiKey: "al-atlas-key", baseUrl: "https://proxy.example.com/v1" });
        expect(request.url).toBe("https://proxy.example.com/v1/embeddings");
    });

    it("lets an explicit environment win over an al- key", async () => {
        const request = await embedAndCapture({ apiKey: "al-atlas-key", environment: "https://env.example.com/v1" });
        expect(request.url).toBe("https://env.example.com/v1/embeddings");
    });

    it("lets the Default environment win over an al- key", async () => {
        const request = await embedAndCapture({
            apiKey: "al-atlas-key",
            environment: VoyageAIEnvironment.Default,
        });
        expect(request.url).toBe("https://api.voyageai.com/v1/embeddings");
    });

    it("fails to authenticate without sending a request when no key is configured", async () => {
        vi.stubEnv("VOYAGE_API_KEY", undefined);
        const captured: Captured[] = [];
        const client = new VoyageAIClient({ fetch: capturingFetch(captured) });

        await expect(client.embed({ input: "hi", model: "voyage-3-large" })).rejects.toThrow(/apiKey/);
        expect(captured).toHaveLength(0);
    });

    it("routes rerank, multimodal and contextualized embeddings to ai.mongodb.com", async () => {
        const urls: string[] = [];
        const fakeFetch: typeof globalThis.fetch = async (url) => {
            urls.push(String(url));
            return new Response(JSON.stringify({ object: "list", data: [], model: "m", usage: { total_tokens: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };
        const client = new VoyageAIClient({ apiKey: "al-atlas-key", fetch: fakeFetch });

        await client.rerank({ model: "rerank-2.5", query: "q", documents: ["a"] });
        await client.multimodalEmbed({
            model: "voyage-multimodal-3.5",
            inputs: [{ content: [{ type: "text", text: "hi" }] }],
        });
        await client.contextualizedEmbed({ model: "voyage-context-3", inputs: [["a", "b"]] });

        expect(urls).toEqual([
            "https://ai.mongodb.com/v1/rerank",
            "https://ai.mongodb.com/v1/multimodalembeddings",
            "https://ai.mongodb.com/v1/contextualizedembeddings",
        ]);
    });
});
