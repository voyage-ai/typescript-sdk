/**
 * SageMaker provider behavior end-to-end through VoyageAIClient and the generated client: routing per
 * operation, SigV4 header handling, API fallback on resolution failure with the normative
 * warning, response normalization, and invoke-error mapping. AWS deps + network are
 * injected/mocked via the provider's test seam — no real AWS, no real HTTP.
 */

import { afterEach, vi } from "vitest";
import type { AwsDeps } from "../../../src/cloud/aws/awsDeps";
import { SageMakerProvider, sagemakerProvider } from "../../../src/cloud/aws/provider";
import { ClientRequestError, VoyageAIClient } from "../../../src/extended/index";

const EMBED_BODY = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 3 },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Test product map: ProductId -> model. The provider is constructed with this injected
// (the real PRODUCT_MAP is populated from the canonical listing config separately).
const PRODUCT_MAP: Readonly<Record<string, string>> = {
    "prod-voyage-3": "voyage-3",
    "prod-mm3": "voyage-multimodal-3",
    "prod-lite": "voyage-4-lite",
    "prod-rerank-2": "rerank-2",
    "prod-ctx4": "voyage-context-4",
};
const PRODUCT_ID_BY_MODEL: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(PRODUCT_MAP).map(([id, model]) => [model, id]),
);

function depsResolving(endpointName: string, model: string): AwsDeps {
    const productId = PRODUCT_ID_BY_MODEL[model];
    return {
        createSigner: () => ({
            async sign({ headers }) {
                return {
                    ...headers,
                    host: "runtime.sagemaker.us-east-1.amazonaws.com",
                    authorization: "AWS4-HMAC...",
                };
            },
        }),
        createDiscovery: () => ({
            async listInServiceEndpointNames() {
                return [endpointName];
            },
            async getEndpointProductId() {
                return productId;
            },
            async getEndpointModelTag() {
                return undefined;
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
            async getEndpointModelTag() {
                return undefined;
            },
        }),
    };
}

/** Client wired to a SageMaker provider whose AWS deps resolve `model` to `endpointName`. */
function clientResolving(
    endpointName: string,
    model: string,
    fetchMock: unknown,
    options: { apiKey?: string } = { apiKey: "key" },
): VoyageAIClient {
    return new VoyageAIClient({
        ...options,
        fetch: fetchMock as typeof fetch,
        provider: sagemakerProvider(
            { region: "us-east-1" },
            { depsLoader: async () => depsResolving(endpointName, model), productMap: PRODUCT_MAP },
        ),
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("SageMaker provider activation", () => {
    test("the factory validates eagerly, so misconfiguration throws at construction", () => {
        expect(() => sagemakerProvider({ region: "us-east-1", awsAccessKeyId: "only-the-id" })).toThrow(
            /must be provided together/,
        );
    });

    test("a provider with no options reads the region and credentials from the AWS environment", () => {
        vi.stubEnv("AWS_REGION", "eu-west-1");
        const provider = sagemakerProvider();
        expect(provider.name).toBe("aws");
        expect(provider.config.region).toBe("eu-west-1");
        expect(provider.config.endpointMap).toEqual({});
        expect(provider.config.credentials).toEqual({ type: "default" });
    });
});

describe("SageMaker provider routing", () => {
    test("embed is signed and POSTed to the resolved endpoint's /invocations", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const client = clientResolving("ep-a", "voyage-3", fetchMock);

        const result = await client.embed({ model: "voyage-3", input: "hi" });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(String(url)).toBe("https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/ep-a/invocations");
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("authorization")).toBe("AWS4-HMAC...");
        // host must be stripped so the fetch layer sets it (forbidden request header).
        expect(headers.get("host")).toBeNull();
        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);
    });

    test("resolution failure with api key falls back to the API with the normative warning, once", async () => {
        const warnSpy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
        const apiFetch = vi.fn(async () => jsonResponse(EMBED_BODY));
        vi.stubGlobal("fetch", apiFetch);
        const client = new VoyageAIClient({
            apiKey: "key",
            provider: sagemakerProvider(
                { region: "us-east-1" },
                { depsLoader: async () => depsNoCandidate(), productMap: PRODUCT_MAP },
            ),
        });

        await client.embed({ model: "voyage-3", input: "hi" });
        await client.embed({ model: "voyage-3", input: "again" });

        for (const call of apiFetch.mock.calls) {
            expect(String((call as unknown as [string])[0])).not.toContain("sagemaker");
        }
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const message = warnSpy.mock.calls[0]?.[0] as string;
        expect(message).toMatch(/^Model 'voyage-3' could not be routed to provider 'aws' \(/);
        expect(message).toMatch(/; falling back to the Voyage API\.$/);
    });

    test("resolution failure without api key propagates", async () => {
        vi.stubEnv("VOYAGE_API_KEY", undefined as unknown as string);
        const client = new VoyageAIClient({
            provider: sagemakerProvider(
                { region: "us-east-1" },
                { depsLoader: async () => depsNoCandidate(), productMap: PRODUCT_MAP },
            ),
        });

        await expect(client.embed({ model: "voyage-3", input: "hi" })).rejects.toThrow(/No SageMaker endpoint/);
    });

    test("legacy bare-array embedding data is normalized to the {embedding} envelope", async () => {
        // The voyage-multimodal-3 marketplace container returns data as bare float arrays.
        const legacyBody = { object: "list", data: [[0.5, 0.6, 0.7]], model: "voyage-multimodal-3" };
        const fetchMock = vi.fn(async () => jsonResponse(legacyBody));
        const client = clientResolving("mm-ep", "voyage-multimodal-3", fetchMock);

        const result = await client.multimodalEmbed({
            model: "voyage-multimodal-3",
            inputs: [{ content: [{ type: "text", text: "hi" }] }],
        });
        expect(result.data?.[0]?.embedding).toEqual([0.5, 0.6, 0.7]);
        expect(result.data?.[0]?.object).toBe("embedding");
        expect(result.data?.[0]?.index).toBe(0);
        // API always includes text on each item; the wrapped item mirrors it.
        expect((result.data?.[0] as Record<string, unknown> | undefined)?.text).toBeNull();
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
        const client = clientResolving("mm-ep", "voyage-multimodal-3", fetchMock);

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
        const client = clientResolving("lite-ep", "voyage-4-lite", fetchMock);

        const result = await client.embed({ model: "voyage-4-lite", input: "hi" });
        expect(Object.keys(result as object).sort()).toEqual(["data", "model", "object", "usage"]);
        // Nested passthrough (usage sub-keys the API also returns) survives.
        expect((result.usage as Record<string, unknown>).text_tokens).toBe(3);
        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);
        // Embed items get text: null too, matching the API envelope.
        expect((result.data?.[0] as Record<string, unknown> | undefined)?.text).toBeNull();
    });

    test("rerank is routed to the resolved SageMaker endpoint", async () => {
        const rerankBody = { object: "list", data: [{ index: 0, relevance_score: 0.9 }], model: "rerank-2" };
        const fetchMock = vi.fn(async () => jsonResponse(rerankBody));
        const client = clientResolving("rr-ep", "rerank-2", fetchMock);

        await client.rerank({ model: "rerank-2", query: "q", documents: ["a", "b"] });
        const [url] = fetchMock.mock.calls[0] as unknown as [string];
        expect(String(url)).toBe("https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/rr-ep/invocations");
    });

    test("contextualizedEmbed is routed and still applies client-side chunking", async () => {
        const contextualizedBody = {
            object: "list",
            data: [
                {
                    object: "list",
                    index: 0,
                    data: [{ object: "embedding", embedding: [0.3, 0.4], index: 0 }],
                },
            ],
            model: "voyage-context-4",
            usage: { total_tokens: 5 },
        };
        const fetchMock = vi.fn(async () => jsonResponse(contextualizedBody));
        const client = clientResolving("ctx-ep", "voyage-context-4", fetchMock);

        const result = await client.contextualizedEmbed({
            model: "voyage-context-4",
            inputs: [["chunk one"]],
        });
        const [url] = fetchMock.mock.calls[0] as unknown as [string];
        expect(String(url)).toBe("https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/ctx-ep/invocations");
        expect(result.results[0]?.embeddings).toEqual([[0.3, 0.4]]);
        expect(result.totalTokens).toBe(5);
    });

    test("a 424 ModelError is remapped to the original status via the response handler", async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse({ ErrorCode: "ModelError", OriginalStatusCode: 400, OriginalMessage: "bad input" }, 424),
        );
        const client = clientResolving("ep-a", "voyage-3", fetchMock);

        const error = await client.embed({ model: "voyage-3", input: "hi" }, { maxRetries: 0 }).catch((e) => e);
        // A 400 from the response handler is the generated client's ClientRequestError, as on the API path.
        expect(error).toBeInstanceOf(ClientRequestError);
        expect(error).toMatchObject({ statusCode: 400 });
        expect(error.message).toContain("SageMaker invalid request: bad input (endpoint 'ep-a', region 'us-east-1')");
    });
});

describe("SageMaker provider internals", () => {
    test("AWS deps, the signer and the resolver are built once and reused", async () => {
        const createSigner = vi.fn(() => ({
            sign: async ({ headers }: { headers: Record<string, string> }) => headers,
        }));
        const createDiscovery = vi.fn((...args: Parameters<AwsDeps["createDiscovery"]>) =>
            depsResolving("ep-a", "voyage-3").createDiscovery(...args),
        );
        const depsLoader = vi.fn(async () => ({ createSigner, createDiscovery }));
        const provider = sagemakerProvider({ region: "us-east-1" }, { depsLoader, productMap: PRODUCT_MAP });

        const first = await provider.resolve("voyage-3");
        const second = await provider.resolve("voyage-3");
        await first.auth.buildHeaders("POST", first.baseUrl, "{}", {});
        await second.auth.buildHeaders("POST", second.baseUrl, undefined, {});

        expect(depsLoader).toHaveBeenCalledTimes(1);
        expect(createDiscovery).toHaveBeenCalledTimes(1);
        expect(createSigner).toHaveBeenCalledTimes(1);
    });

    test("an undefined body is signed as an empty string", async () => {
        const sign = vi.fn(async ({ headers }: { headers: Record<string, string>; body: string }) => headers);
        const provider = sagemakerProvider(
            { region: "us-east-1", endpointMap: { "voyage-3": "ep-a" } },
            {
                depsLoader: async () => ({
                    createSigner: () => ({ sign }),
                    createDiscovery: depsNoCandidate().createDiscovery,
                }),
            },
        );
        const transport = await provider.resolve("voyage-3");
        await transport.auth.buildHeaders("POST", transport.baseUrl, undefined, { a: "b" });
        expect(sign).toHaveBeenCalledWith({ method: "POST", url: transport.baseUrl, headers: { a: "b" }, body: "" });
    });

    test("construction without internals reads process.env for the region", () => {
        vi.stubEnv("AWS_REGION", "ca-central-1");
        expect(new SageMakerProvider().config.region).toBe("ca-central-1");
        expect(new SageMakerProvider().config.endpointMap).toEqual({});
    });

    test("the response handler is bound to the resolved model's family", async () => {
        const rerankBody = {
            object: "list",
            data: [{ index: 0, relevance_score: 0.9 }],
            model: "rerank-2",
            total_ms: 1,
        };
        const fetchMock = vi.fn(async () => jsonResponse(rerankBody));
        const client = clientResolving("rr-ep", "rerank-2", fetchMock);
        const result = await client.rerank({ model: "rerank-2", query: "q", documents: ["a"] });
        expect(Object.keys(result as object).sort()).toEqual(["data", "model", "object"]);
    });
});
