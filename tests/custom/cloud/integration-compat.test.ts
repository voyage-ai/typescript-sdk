/**
 * Integrations reaching a cloud provider without changes.
 *
 * The two classes below stand in for real integrations. `LlamaIndexStyleEmbedding` is a faithful
 * copy of what `@llamaindex/voyage-ai` does today (builds `new VoyageAIClient({ apiKey })` itself,
 * with `apiKey` defaulting to `""`). `LangChainStyleEmbeddings` is what `@langchain/community`'s
 * `VoyageEmbeddings` would look like after moving from its own `fetch` calls to this SDK: it passes
 * the key through, lets the SDK validate it, and optionally accepts a ready-made client.
 *
 * Neither class knows about providers. The application picks the backend with
 * `setDefaultProvider(...)` or `VOYAGE_CLOUD_PROVIDER`, or hands in a `SageMakerVoyageAIClient`.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import type { AwsDeps } from "../../../src/cloud/aws/awsDeps";
import {
    AwsDependencyError,
    ProviderResolutionError,
    SageMakerVoyageAIClient,
    sagemakerProvider,
    setDefaultProvider,
    VoyageAIClient,
} from "../../../src/extended/index";

/** As in @llamaindex/voyage-ai: the client is created in the constructor from an optional key. */
class LlamaIndexStyleEmbedding {
    private readonly client: VoyageAIClient;

    constructor(init?: { apiKey?: string; model?: string }) {
        this.model = init?.model ?? "voyage-3";
        this.client = new VoyageAIClient({ apiKey: init?.apiKey ?? process.env.VOYAGE_API_TOKEN ?? "" });
    }

    private readonly model: string;

    async getTextEmbedding(text: string): Promise<number[]> {
        const response = await this.client.embed({ model: this.model, input: [text], truncation: true });
        return response.data?.[0]?.embedding ?? [];
    }
}

/** A LangChain-style integration on top of this SDK, with an optional client injection point. */
class LangChainStyleEmbeddings {
    private readonly client: VoyageAIClient;

    constructor(fields: { apiKey?: string; model?: string; client?: VoyageAIClient } = {}) {
        this.model = fields.model ?? "voyage-3.5";
        this.client = fields.client ?? new VoyageAIClient({ apiKey: fields.apiKey });
    }

    private readonly model: string;

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

/** AWS SDK stand-ins: a signer, and discovery that finds no endpoint (an explicit endpointMap is used). */
function fakeAwsDeps(): AwsDeps {
    return {
        createSigner: () => ({
            async sign({ headers }) {
                return { ...headers, authorization: "AWS4-HMAC-SHA256 fake" };
            },
        }),
        createDiscovery: () => ({
            listInServiceEndpointNames: async () => [],
            getEndpointProductId: async () => undefined,
            getEndpointModelTag: async () => undefined,
        }),
    };
}

const SAGEMAKER_URL = "https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints";

afterEach(() => {
    setDefaultProvider(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("integrations without any cloud configuration", () => {
    test("keep calling the Voyage API exactly as before", async () => {
        const calls = stubFetch();
        await new LlamaIndexStyleEmbedding({ apiKey: "pa-key" }).getTextEmbedding("hi");
        await new LangChainStyleEmbeddings({ apiKey: "pa-key" }).embedQuery("hi");

        expect(calls).toEqual([
            { url: "https://api.voyageai.com/v1/embeddings", authorization: "Bearer pa-key" },
            { url: "https://api.voyageai.com/v1/embeddings", authorization: "Bearer pa-key" },
        ]);
    });
});

describe("setDefaultProvider: one line at application startup", () => {
    test("routes unchanged integrations to SageMaker, with no Voyage API key at all", async () => {
        vi.stubEnv("VOYAGE_API_KEY", undefined as unknown as string);
        vi.stubEnv("VOYAGE_API_TOKEN", undefined as unknown as string);
        const calls = stubFetch();

        // Application code:
        setDefaultProvider(
            sagemakerProvider(
                { region: "us-east-1", endpointMap: { "voyage-3": "ep-v3", "voyage-3.5": "ep-v35" } },
                { depsLoader: async () => fakeAwsDeps() },
            ),
        );

        // Integration code, unchanged:
        expect(await new LlamaIndexStyleEmbedding().getTextEmbedding("hi")).toEqual([0.1, 0.2]);
        expect(await new LangChainStyleEmbeddings().embedQuery("hi")).toEqual([0.1, 0.2]);

        expect(calls).toEqual([
            { url: `${SAGEMAKER_URL}/ep-v3/invocations`, authorization: "AWS4-HMAC-SHA256 fake" },
            { url: `${SAGEMAKER_URL}/ep-v35/invocations`, authorization: "AWS4-HMAC-SHA256 fake" },
        ]);
    });

    test("a model with no endpoint and no Voyage API key reports the resolution error, not a 401", async () => {
        vi.stubEnv("VOYAGE_API_KEY", undefined as unknown as string);
        vi.stubEnv("VOYAGE_API_TOKEN", undefined as unknown as string);
        const calls = stubFetch();
        setDefaultProvider(sagemakerProvider({ region: "us-east-1" }, { depsLoader: async () => fakeAwsDeps() }));

        // The integration passes apiKey: "" — that must not count as a key and trigger the API fallback.
        await expect(new LlamaIndexStyleEmbedding().getTextEmbedding("hi")).rejects.toBeInstanceOf(
            ProviderResolutionError,
        );
        expect(calls).toEqual([]);
    });

    test("with a Voyage API key, models without an endpoint fall back to the API", async () => {
        vi.spyOn(process, "emitWarning").mockImplementation(() => {});
        const calls = stubFetch();
        setDefaultProvider(sagemakerProvider({ region: "us-east-1" }, { depsLoader: async () => fakeAwsDeps() }));

        await new LlamaIndexStyleEmbedding({ apiKey: "pa-key" }).getTextEmbedding("hi");

        expect(calls).toEqual([{ url: "https://api.voyageai.com/v1/embeddings", authorization: "Bearer pa-key" }]);
    });
});

describe("VOYAGE_CLOUD_PROVIDER: no code at all", () => {
    test("routes an unchanged integration to SageMaker", async () => {
        vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
        vi.stubEnv("AWS_REGION", "us-east-1");
        const calls = stubFetch();

        // The AWS SDK is not installed in this repository, so reaching the SageMaker path shows up as
        // the install hint — proof that the call went to SageMaker, not to the Voyage API.
        await expect(new LlamaIndexStyleEmbedding({ apiKey: "pa-key" }).getTextEmbedding("hi")).rejects.toBeInstanceOf(
            AwsDependencyError,
        );
        expect(calls).toEqual([]);
    });
});

describe("explicit client injection", () => {
    test("an integration that accepts a client takes a SageMakerVoyageAIClient as is", async () => {
        const calls = stubFetch();
        const client = new SageMakerVoyageAIClient(
            { region: "us-east-1", endpointMap: { "voyage-3.5": "ep-v35" } },
            { depsLoader: async () => fakeAwsDeps() },
        );

        await new LangChainStyleEmbeddings({ client }).embedQuery("hi");

        expect(calls).toEqual([{ url: `${SAGEMAKER_URL}/ep-v35/invocations`, authorization: "AWS4-HMAC-SHA256 fake" }]);
    });
});
