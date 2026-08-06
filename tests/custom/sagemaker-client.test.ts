/**
 * ExtendedClient SageMaker routing (spec §11): activation, per-call routing to SageMaker,
 * and API fallback on resolution failure. AWS deps + network are injected/mocked.
 */

import { afterEach, vi } from "vitest";
import { VoyageAIClient } from "../../src/extended/ExtendedClient";
import type { AwsDeps } from "../../src/sagemaker/awsDeps";
import type { SageMakerConfig } from "../../src/sagemaker/config";
import { SageMakerRuntime } from "../../src/sagemaker/runtime";

const config: SageMakerConfig = {
    region: "us-east-1",
    endpointMap: {},
    credentials: { type: "default" },
};

const EMBED_BODY = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 3 },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Test product map: ProductId -> model. The runtime is constructed with this injected
// (the real PRODUCT_MAP is populated from the canonical listing config separately).
const PRODUCT_MAP: Readonly<Record<string, string>> = {
    "prod-voyage-3": "voyage-3",
    "prod-mm3": "voyage-multimodal-3",
    "prod-lite": "voyage-4-lite",
    "prod-rerank-2": "rerank-2",
};
const PRODUCT_ID_BY_MODEL: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(PRODUCT_MAP).map(([id, model]) => [model, id]),
);

function depsResolving(endpointName: string, model: string): AwsDeps {
    const productId = PRODUCT_ID_BY_MODEL[model];
    return {
        createSigner: () => ({
            async sign({ headers }) {
                return { ...headers, authorization: "AWS4-HMAC..." };
            },
        }),
        createDiscovery: () => ({
            async listInServiceEndpointNames() {
                return [endpointName];
            },
            async getEndpointProductId() {
                return productId;
            },
        }),
    };
}

function depsNoCandidate(): AwsDeps {
    return {
        createSigner: () => ({
            async sign({ headers }) {
                return headers;
            },
        }),
        createDiscovery: () => ({
            async listInServiceEndpointNames() {
                return [];
            },
            async getEndpointProductId() {
                return undefined;
            },
        }),
    };
}

function injectRuntime(client: VoyageAIClient, runtime: SageMakerRuntime): void {
    // biome-ignore lint/suspicious/noExplicitAny: assigning protected field for injection in tests
    (client as any)._sagemaker = runtime;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SageMaker activation", () => {
    test("not activated -> _sagemaker undefined, embed hits the API", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const client = new VoyageAIClient({ apiKey: "key", fetch: fetchMock as unknown as typeof fetch });
        // biome-ignore lint/suspicious/noExplicitAny: reading protected field in test
        expect((client as any)._sagemaker).toBeUndefined();

        await client.embed({ model: "voyage-3", input: "hi" });
        const [url] = fetchMock.mock.calls[0] as unknown as [string];
        expect(url).not.toContain("sagemaker");
    });

    test("awsSagemaker option activates the runtime", () => {
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
        });
        // biome-ignore lint/suspicious/noExplicitAny: reading protected field in test
        expect((client as any)._sagemaker).toBeInstanceOf(SageMakerRuntime);
    });
});

describe("SageMaker routing", () => {
    test("embed is routed to the resolved SageMaker endpoint", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: true,
                depsLoader: async () => depsResolving("ep-a", "voyage-3"),
                productMap: PRODUCT_MAP,
            }),
        );

        const result = await client.embed({ model: "voyage-3", input: "hi" });
        const [url] = fetchMock.mock.calls[0] as unknown as [string];
        expect(url).toBe("https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/ep-a/invocations");
        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);
    });

    test("resolution failure with api key falls back to the API and warns once", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: true,
                depsLoader: async () => depsNoCandidate(),
                productMap: PRODUCT_MAP,
            }),
        );

        await client.embed({ model: "voyage-3", input: "hi" });
        await client.embed({ model: "voyage-3", input: "again" });

        for (const call of fetchMock.mock.calls) {
            expect((call as unknown as [string])[0]).not.toContain("sagemaker");
        }
        expect(warn).toHaveBeenCalledTimes(1);
    });

    test("resolution failure without api key propagates", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const client = new VoyageAIClient({
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: false,
                depsLoader: async () => depsNoCandidate(),
                productMap: PRODUCT_MAP,
            }),
        );

        await expect(client.embed({ model: "voyage-3", input: "hi" })).rejects.toThrow(/No SageMaker endpoint/);
    });

    test("legacy bare-array embedding data is normalized to the {embedding} envelope", async () => {
        // The voyage-multimodal-3 marketplace container returns data as bare float arrays.
        const legacyBody = { object: "list", data: [[0.5, 0.6, 0.7]], model: "voyage-multimodal-3" };
        const fetchMock = vi.fn(async () => jsonResponse(legacyBody));
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: true,
                depsLoader: async () => depsResolving("mm-ep", "voyage-multimodal-3"),
                productMap: PRODUCT_MAP,
            }),
        );

        const result = await client.multimodalEmbed({
            model: "voyage-multimodal-3",
            inputs: [{ content: [{ type: "text", text: "hi" }] }],
        });
        expect(result.data?.[0]?.embedding).toEqual([0.5, 0.6, 0.7]);
        expect(result.data?.[0]?.object).toBe("embedding");
        expect(result.data?.[0]?.index).toBe(0);
        // API always includes text on each item; the wrapped item mirrors it.
        expect(result.data?.[0]?.text).toBeNull();
    });

    test("multimodal usage backfills the API pixel keys the container omits", async () => {
        // The voyage-multimodal-3 container omits video_pixels; the API always reports it.
        const body = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
            model: "voyage-multimodal-3",
            usage: { total_tokens: 4, text_tokens: 4, image_pixels: 0 },
        };
        const fetchMock = vi.fn(async () => jsonResponse(body));
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: true,
                depsLoader: async () => depsResolving("mm-ep", "voyage-multimodal-3"),
                productMap: PRODUCT_MAP,
            }),
        );

        const result = await client.multimodalEmbed({
            model: "voyage-multimodal-3",
            inputs: [{ content: [{ type: "text", text: "hi" }] }],
        });
        const usage = result.usage as Record<string, unknown>;
        expect(usage.video_pixels).toBe(0);
        expect(usage.text_tokens).toBe(4);
        expect(usage.image_pixels).toBe(0);
        expect(result.usage?.totalTokens).toBe(4);
    });

    test("SageMaker-only top-level telemetry keys are stripped for API parity", async () => {
        // voyage-4-lite's container adds inference_ms / total_embed_ms; the API never returns them.
        const telemetryBody = {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
            model: "voyage-4-lite",
            usage: { total_tokens: 3, text_tokens: 3 },
            inference_ms: 12,
            total_embed_ms: 15,
        };
        const fetchMock = vi.fn(async () => jsonResponse(telemetryBody));
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: true,
                depsLoader: async () => depsResolving("lite-ep", "voyage-4-lite"),
                productMap: PRODUCT_MAP,
            }),
        );

        const result = await client.embed({ model: "voyage-4-lite", input: "hi" });
        expect(Object.keys(result as object).sort()).toEqual(["data", "model", "object", "usage"]);
        // Nested passthrough (usage sub-keys the API also returns) survives.
        expect((result.usage as Record<string, unknown>).text_tokens).toBe(3);
        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);
        // Embed items get text: null too, matching the API envelope.
        expect(result.data?.[0]?.text).toBeNull();
    });

    test("rerank is routed to the resolved SageMaker endpoint", async () => {
        const rerankBody = { object: "list", data: [{ index: 0, relevance_score: 0.9 }], model: "rerank-2" };
        const fetchMock = vi.fn(async () => jsonResponse(rerankBody));
        const client = new VoyageAIClient({
            apiKey: "key",
            awsSagemaker: { region: "us-east-1" },
            fetch: fetchMock as unknown as typeof fetch,
        });
        injectRuntime(
            client,
            new SageMakerRuntime(config, {
                hasApiKey: true,
                depsLoader: async () => depsResolving("rr-ep", "rerank-2"),
                productMap: PRODUCT_MAP,
            }),
        );

        await client.rerank({ model: "rerank-2", query: "q", documents: ["a", "b"] });
        const [url] = fetchMock.mock.calls[0] as unknown as [string];
        expect(url).toBe("https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/rr-ep/invocations");
    });
});
