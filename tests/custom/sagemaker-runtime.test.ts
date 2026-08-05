/**
 * SageMaker runtime invocation: SigV4-signed POST over the shared fetcher, response
 * parsing, error mapping and the once-per-model fallback warning. AWS deps and the
 * network are both injected/mocked — no real AWS, no real HTTP.
 */

import { afterEach, vi } from "vitest";
import { VoyageAIError } from "../../src/errors/VoyageAIError";
import type { AwsDeps } from "../../src/sagemaker/awsDeps";
import type { SageMakerConfig } from "../../src/sagemaker/config";
import { SageMakerRuntime } from "../../src/sagemaker/runtime";

const config: SageMakerConfig = {
    region: "us-east-1",
    endpointMap: { "voyage-3": "ep-a" },
    credentials: { type: "default" },
};

function fakeDeps(): AwsDeps {
    return {
        createSigner: () => ({
            async sign({ headers }) {
                return { ...headers, host: "runtime.sagemaker.us-east-1.amazonaws.com", authorization: "AWS4-HMAC..." };
            },
        }),
        createDiscovery: () => ({
            async listInServiceEndpointNames() {
                return ["ep-a"];
            },
            async getEndpointModelPackageArns() {
                return [];
            },
            async getEndpointModelTag() {
                return undefined;
            },
        }),
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const EMBED_BODY = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 3 },
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SageMakerRuntime.invoke", () => {
    test("signs and POSTs to the runtime URL, returns parsed body", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const runtime = new SageMakerRuntime(config, { hasApiKey: true, depsLoader: async () => fakeDeps() });

        const endpoint = await runtime.resolveEndpoint("voyage-3");
        expect(endpoint).toBe("ep-a");

        const { body } = await runtime.invoke(endpoint, JSON.stringify({ model: "voyage-3", input: "hi" }), {
            fetch: fetchMock as unknown as typeof fetch,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://runtime.sagemaker.us-east-1.amazonaws.com/endpoints/ep-a/invocations");
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("authorization")).toBe("AWS4-HMAC...");
        // host must be stripped so the fetch layer sets it (forbidden request header).
        expect(headers.get("host")).toBeNull();
        expect(init.body).toBe(JSON.stringify({ model: "voyage-3", input: "hi" }));
        expect(body).toMatchObject({ model: "voyage-3" });
    });

    test("maps a 424 ModelError to the original status", async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse({ ErrorCode: "ModelError", OriginalStatusCode: 429, OriginalMessage: "slow down" }, 424),
        );
        const runtime = new SageMakerRuntime(config, { hasApiKey: false, depsLoader: async () => fakeDeps() });
        const endpoint = await runtime.resolveEndpoint("voyage-3");

        await expect(
            runtime.invoke(endpoint, "{}", { fetch: fetchMock as unknown as typeof fetch, maxRetries: 0 }),
        ).rejects.toMatchObject({ statusCode: 429 });
    });

    test("maps a 500 to a VoyageAIError", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ Message: "kaboom" }, 500));
        const runtime = new SageMakerRuntime(config, { hasApiKey: false, depsLoader: async () => fakeDeps() });
        const endpoint = await runtime.resolveEndpoint("voyage-3");
        await expect(
            runtime.invoke(endpoint, "{}", { fetch: fetchMock as unknown as typeof fetch, maxRetries: 0 }),
        ).rejects.toBeInstanceOf(VoyageAIError);
    });
});

describe("SageMakerRuntime.warnOnce", () => {
    test("warns at most once per model", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const runtime = new SageMakerRuntime(config, { hasApiKey: true, depsLoader: async () => fakeDeps() });
        runtime.warnOnce("voyage-x", "no endpoint");
        runtime.warnOnce("voyage-x", "no endpoint");
        runtime.warnOnce("voyage-y", "no endpoint");
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
