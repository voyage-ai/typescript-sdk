/**
 * Integrations reaching a cloud provider without any change: the provider is chosen inside the
 * SDK from `VOYAGE_CLOUD_PROVIDER`, and nothing about it is visible to integration code.
 *
 * The two classes below stand in for real integrations. `LlamaIndexStyleEmbedding` is a faithful
 * copy of what `@llamaindex/voyage-ai` does today (builds `new VoyageAIClient({ apiKey })` itself,
 * with `apiKey` defaulting to `""`). `LangChainStyleEmbeddings` is what `@langchain/community`'s
 * `VoyageEmbeddings` would look like on top of this SDK instead of its own `fetch` calls.
 *
 * The AWS SDK is not installed here, so its loader is replaced with stand-ins: a signer, and an
 * account with two endpoints tagged `voyageai:model=voyage-3` and `voyageai:model=voyage-3.5`.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { ProviderResolutionError, VoyageAIClient } from "../../../src/extended/index";

vi.mock("../../../src/cloud/aws/awsDeps", async (importOriginal) => {
    const original = await importOriginal<typeof import("../../../src/cloud/aws/awsDeps")>();
    const tags: Record<string, string> = { "ep-voyage-3": "voyage-3", "ep-voyage-3-5": "voyage-3.5" };
    return {
        ...original,
        loadAwsDeps: async () => ({
            createSigner: () => ({
                async sign({ headers }: { headers: Record<string, string> }) {
                    return { ...headers, authorization: "AWS4-HMAC-SHA256 fake" };
                },
            }),
            createDiscovery: () => ({
                listInServiceEndpointNames: async () => Object.keys(tags),
                getEndpointProductId: async () => undefined,
                getEndpointModelTag: async (endpointName: string) => tags[endpointName],
            }),
        }),
    };
});

/** As in @llamaindex/voyage-ai: the client is created in the constructor from an optional key. */
class LlamaIndexStyleEmbedding {
    private readonly client: VoyageAIClient;
    private readonly model: string;

    constructor(init?: { apiKey?: string; model?: string }) {
        this.model = init?.model ?? "voyage-3";
        this.client = new VoyageAIClient({ apiKey: init?.apiKey ?? process.env.VOYAGE_API_TOKEN ?? "" });
    }

    async getTextEmbedding(text: string): Promise<number[]> {
        const response = await this.client.embed({ model: this.model, input: [text], truncation: true });
        return response.data?.[0]?.embedding ?? [];
    }
}

/** A LangChain-style integration on top of this SDK: it passes the key through and nothing else. */
class LangChainStyleEmbeddings {
    private readonly client: VoyageAIClient;
    private readonly model: string;

    constructor(fields: { apiKey?: string; model?: string } = {}) {
        this.model = fields.model ?? "voyage-3.5";
        this.client = new VoyageAIClient({ apiKey: fields.apiKey });
    }

    async embedQuery(text: string): Promise<number[]> {
        const response = await this.client.embed({ model: this.model, input: text, inputType: "query" });
        return response.data?.[0]?.embedding ?? [];
    }
}

const EMBED_BODY = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 3 },
};

interface Call {
    url: string;
    authorization: string | null;
}

/** Stub the global fetch (integrations do not pass one) and record where requests go. */
function stubFetch(): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init: RequestInit = {}) => {
        calls.push({ url: String(url), authorization: new Headers(init.headers).get("authorization") });
        return new Response(JSON.stringify(EMBED_BODY), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });
    return calls;
}

function stubVoyageCloudProvider(): void {
    vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
    vi.stubEnv("AWS_REGION", "us-east-1");
}

function stubNoVoyageKey(): void {
    vi.stubEnv("VOYAGE_API_KEY", undefined as unknown as string);
    vi.stubEnv("VOYAGE_API_TOKEN", undefined as unknown as string);
}

const SAGEMAKER_URL = "https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints";
const SIGNED = "AWS4-HMAC-SHA256 fake";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("without VOYAGE_CLOUD_PROVIDER", () => {
    test("integrations keep calling the Voyage API exactly as before", async () => {
        const calls = stubFetch();
        await new LlamaIndexStyleEmbedding({ apiKey: "pa-key" }).getTextEmbedding("hi");
        await new LangChainStyleEmbeddings({ apiKey: "pa-key" }).embedQuery("hi");

        expect(calls).toEqual([
            { url: "https://api.voyageai.com/v1/embeddings", authorization: "Bearer pa-key" },
            { url: "https://api.voyageai.com/v1/embeddings", authorization: "Bearer pa-key" },
        ]);
    });
});

describe("with VOYAGE_CLOUD_PROVIDER=aws", () => {
    test("unchanged integrations go to the SageMaker endpoints discovery finds, with no Voyage API key", async () => {
        stubVoyageCloudProvider();
        stubNoVoyageKey();
        const calls = stubFetch();

        expect(await new LlamaIndexStyleEmbedding().getTextEmbedding("hi")).toEqual([0.1, 0.2]);
        expect(await new LangChainStyleEmbeddings().embedQuery("hi")).toEqual([0.1, 0.2]);

        expect(calls).toEqual([
            { url: `${SAGEMAKER_URL}/ep-voyage-3/invocations`, authorization: SIGNED },
            { url: `${SAGEMAKER_URL}/ep-voyage-3-5/invocations`, authorization: SIGNED },
        ]);
    });

    test("a model with no endpoint and no Voyage API key reports the resolution error, not a 401", async () => {
        stubVoyageCloudProvider();
        stubNoVoyageKey();
        const calls = stubFetch();

        // The integration passes apiKey: "" — that must not count as a key and trigger the API fallback.
        await expect(
            new LlamaIndexStyleEmbedding({ model: "voyage-code-3" }).getTextEmbedding("hi"),
        ).rejects.toBeInstanceOf(ProviderResolutionError);
        expect(calls).toEqual([]);
    });

    test("with a Voyage API key, a model with no endpoint falls back to the API", async () => {
        stubVoyageCloudProvider();
        vi.spyOn(process, "emitWarning").mockImplementation(() => {});
        const calls = stubFetch();

        await new LlamaIndexStyleEmbedding({ apiKey: "pa-key", model: "voyage-code-3" }).getTextEmbedding("hi");

        expect(calls).toEqual([{ url: "https://api.voyageai.com/v1/embeddings", authorization: "Bearer pa-key" }]);
    });
});
