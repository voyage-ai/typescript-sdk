/**
 * The provider seam on VoyageAIClient, with fake providers only (nothing here knows about
 * SageMaker): routing, decline, resolution-failure fallback, and — the point of the design — that
 * provider calls run through the unmodified generated client, so its serialization, headers,
 * retries, typed errors and raw-response access apply to them exactly as to Voyage API calls.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import {
    ClientRequestError,
    type Provider,
    ProviderResolutionError,
    ServerError,
    type Transport,
    VoyageAIClient,
    VoyageAIError,
} from "../../../src/extended/index";

const BACKEND = "https://backend.example.com/endpoints/ep-1";

const EMBED_BODY = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 3 },
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

interface Call {
    url: string;
    headers: Headers;
    body: unknown;
}

/** A fetch that records every request and answers with the queued responses (last one repeats). */
function recordingFetch(...responses: Array<() => Response>): typeof fetch & { calls: Call[] } {
    const calls: Call[] = [];
    const fn = async (url: unknown, init: RequestInit = {}): Promise<Response> => {
        calls.push({
            url: String(url),
            headers: new Headers(init.headers),
            body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        });
        const next = responses[Math.min(calls.length - 1, responses.length - 1)];
        return next ? next() : jsonResponse(EMBED_BODY);
    };
    return Object.assign(fn as typeof fetch, { calls });
}

function signingAuth(): Transport["auth"] & { signed: number } {
    const auth = {
        signed: 0,
        async buildHeaders(_method: string, _url: string, _body: string | undefined, headers: Record<string, string>) {
            auth.signed += 1;
            return { ...headers, authorization: `Signed ${auth.signed}` };
        },
    };
    return auth;
}

/** Provider serving `models` through one transport, declining every other model. */
function servingProvider(models: string[], transport: Partial<Transport> = {}): Provider & { resolved: string[] } {
    const resolved: string[] = [];
    const full: Transport = { baseUrl: BACKEND, path: "/invocations", auth: signingAuth(), ...transport };
    return {
        name: "fake",
        resolved,
        async resolve(model) {
            resolved.push(model);
            return models.includes(model) ? full : undefined;
        },
    };
}

function failingProvider(error: Error): Provider {
    return {
        name: "fake",
        async resolve() {
            throw error;
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("routing", () => {
    test("without a provider every call goes to the Voyage API, as before", async () => {
        const fetch = recordingFetch();
        const client = new VoyageAIClient({ apiKey: "key", fetch });
        expect(client.provider).toBeUndefined();

        await client.embed({ model: "voyage-3", input: "hi" });

        expect(fetch.calls[0].url).toBe("https://api.voyageai.com/v1/embeddings");
        expect(fetch.calls[0].headers.get("authorization")).toBe("Bearer key");
    });

    test("a served model goes to the transport, serialized and signed, without the Voyage API key", async () => {
        const fetch = recordingFetch();
        const provider = servingProvider(["voyage-3"]);
        const client = new VoyageAIClient({ apiKey: "key", fetch, provider, headers: { "X-Client": "c" } });

        const result = await client.embed(
            { model: "voyage-3", input: ["hi"], inputType: "query" },
            { headers: { "X-Call": "1" } },
        );

        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);
        expect(result.usage?.totalTokens).toBe(3);
        const call = fetch.calls[0];
        expect(call.url).toBe(`${BACKEND}/invocations`);
        // The generated serializer built the body (camelCase -> snake_case).
        expect(call.body).toEqual({ input: ["hi"], model: "voyage-3", input_type: "query" });
        // The Voyage API bearer token never reaches another backend; the transport signs instead.
        expect(call.headers.get("authorization")).toBe("Signed 1");
        // SDK identity, model header, client and per-call headers are the same as on the API path.
        expect(call.headers.get("user-agent")).toMatch(/^voyageai-typescript\//);
        expect(call.headers.get("x-voyage-model")).toBe("voyage-3");
        expect(call.headers.get("x-client")).toBe("c");
        expect(call.headers.get("x-call")).toBe("1");
        expect(provider.resolved).toEqual(["voyage-3"]);
    });

    test("a provider-only client needs no Voyage API key", async () => {
        vi.stubEnv("VOYAGE_API_KEY", undefined as unknown as string);
        const fetch = recordingFetch();
        const client = new VoyageAIClient({ fetch, provider: servingProvider(["voyage-3"]) });

        await client.embed({ model: "voyage-3", input: "hi" });

        expect(fetch.calls[0].headers.get("authorization")).toBe("Signed 1");
    });

    test("a declined model goes to the Voyage API with the bearer token", async () => {
        const fetch = recordingFetch();
        const provider = servingProvider(["voyage-3"]);
        const client = new VoyageAIClient({ apiKey: "key", fetch, provider });

        await client.rerank({ model: "rerank-2", query: "q", documents: ["a"] });

        expect(fetch.calls[0].url).toBe("https://api.voyageai.com/v1/rerank");
        expect(fetch.calls[0].headers.get("authorization")).toBe("Bearer key");
        expect(provider.resolved).toEqual(["rerank-2"]);
    });

    test("every operation reaches the transport, honoring per-operation paths and query params", async () => {
        const fetch = recordingFetch(
            () => jsonResponse(EMBED_BODY),
            () => jsonResponse({ object: "list", data: [{ index: 0, relevance_score: 0.9 }], model: "m" }),
            () => jsonResponse({ object: "list", data: [], model: "m", usage: { total_tokens: 0 } }),
            () =>
                jsonResponse({
                    object: "list",
                    data: [{ object: "list", index: 0, data: [{ object: "embedding", embedding: [1], index: 0 }] }],
                    model: "m",
                    usage: { total_tokens: 2 },
                }),
        );
        const provider = servingProvider(["m"], { paths: { rerank: "/rank" } });
        const client = new VoyageAIClient({ fetch, provider });

        await client.embed({ model: "m", input: "hi" }, { queryParams: { trace: "1" } });
        await client.rerank({ model: "m", query: "q", documents: ["a"] });
        await client.multimodalEmbed({ model: "m", inputs: [{ content: [{ type: "text", text: "hi" }] }] });
        const contextualized = await client.contextualizedEmbed({
            model: "m",
            inputs: [["one two"]],
            chunkFn: (text) => text.split(" "),
        });

        expect(fetch.calls.map((call) => call.url)).toEqual([
            `${BACKEND}/invocations?trace=1`,
            `${BACKEND}/rank`,
            `${BACKEND}/invocations`,
            `${BACKEND}/invocations`,
        ]);
        // Client-side chunking ran before the provider call, as on the API path.
        expect((fetch.calls[3].body as { inputs: string[][] }).inputs).toEqual([["one", "two"]]);
        expect(contextualized.results[0]?.chunkTexts).toEqual(["one", "two"]);
        expect(contextualized.totalTokens).toBe(2);
    });

    test("the request adapter rewrites the serialized body before signing", async () => {
        const fetch = recordingFetch();
        const auth = signingAuth();
        const signedBodies: Array<string | undefined> = [];
        const buildHeaders = auth.buildHeaders;
        auth.buildHeaders = async (method, url, body, headers) => {
            signedBodies.push(body);
            return buildHeaders(method, url, body, headers);
        };
        const client = new VoyageAIClient({
            fetch,
            provider: servingProvider(["voyage-3"], {
                auth,
                requestAdapter: (operation, body) => JSON.stringify({ operation, payload: JSON.parse(body) }),
            }),
        });

        await client.embed({ model: "voyage-3", input: "hi" });

        expect(fetch.calls[0].body).toEqual({ operation: "embed", payload: { input: "hi", model: "voyage-3" } });
        expect(signedBodies).toEqual([JSON.stringify(fetch.calls[0].body)]);
    });

    test("wrapper metadata registered later is sent on provider calls too", async () => {
        const fetch = recordingFetch();
        const client = new VoyageAIClient({ fetch, provider: servingProvider(["voyage-3"]) });
        client.appendClientMetadata({ name: "mem0", version: "1.2.3" });

        await client.embed({ model: "voyage-3", input: "hi" });

        expect(fetch.calls[0].headers.get("x-voyage-wrapper")).toBe("mem0/1.2.3");
    });

    test("an invalid model is rejected before the provider is asked", async () => {
        const provider = servingProvider(["voyage-3"]);
        const client = new VoyageAIClient({ fetch: recordingFetch(), provider });

        await expect(client.embed({ model: "  ", input: "hi" })).rejects.toThrow(/model is required/);
        expect(provider.resolved).toEqual([]);
    });
});

describe("generated client behavior on provider calls", () => {
    test("a translated 503 is retried by the generated retry loop, signed afresh each attempt", async () => {
        const fetch = recordingFetch(
            () => jsonResponse({ busy: true }, 503),
            () => jsonResponse(EMBED_BODY),
        );
        const auth = signingAuth();
        const client = new VoyageAIClient({
            fetch,
            provider: servingProvider(["voyage-3"], {
                auth,
                responseHandler: (status, body) => ({ status, body }),
            }),
        });

        const result = await client.embed({ model: "voyage-3", input: "hi" });

        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);
        expect(fetch.calls).toHaveLength(2);
        expect(fetch.calls.map((call) => call.headers.get("authorization"))).toEqual(["Signed 1", "Signed 2"]);
    });

    test("translated error statuses become the generated client's typed errors", async () => {
        const responseHandler = (status: number, body: unknown) => ({
            status: (body as { mapped: number }).mapped,
            body: { detail: `backend said ${status}` },
        });
        const client = (mapped: number) =>
            new VoyageAIClient({
                fetch: recordingFetch(() => jsonResponse({ mapped }, 418)),
                maxRetries: 0,
                provider: servingProvider(["voyage-3"], { responseHandler }),
            });

        const badRequest = await client(400)
            .embed({ model: "voyage-3", input: "hi" })
            .catch((e) => e);
        expect(badRequest).toBeInstanceOf(ClientRequestError);
        expect(badRequest.body).toEqual({ detail: "backend said 418" });

        await expect(client(500).embed({ model: "voyage-3", input: "hi" })).rejects.toBeInstanceOf(ServerError);

        const other = await client(404)
            .embed({ model: "voyage-3", input: "hi" })
            .catch((e) => e);
        expect(other).toBeInstanceOf(VoyageAIError);
        expect(other.statusCode).toBe(404);
        expect(other.message).toContain("backend said 418");
    });

    test("withRawResponse reports the backend that answered", async () => {
        const fetch = recordingFetch(() => jsonResponse(EMBED_BODY, 200, { "x-amzn-requestid": "req-1" }));
        const client = new VoyageAIClient({
            fetch,
            provider: servingProvider(["voyage-3"], { responseHandler: (status, body) => ({ status, body }) }),
        });

        const { data, rawResponse } = await client.embed({ model: "voyage-3", input: "hi" }).withRawResponse();

        expect(data.model).toBe("voyage-3");
        expect(rawResponse.status).toBe(200);
        expect(rawResponse.url).toBe(`${BACKEND}/invocations`);
        expect(rawResponse.headers.get("x-amzn-requestid")).toBe("req-1");
    });

    test("without a response handler the backend response is used as is", async () => {
        const fetch = recordingFetch(() => jsonResponse({ detail: "nope" }, 400));
        const client = new VoyageAIClient({ fetch, provider: servingProvider(["voyage-3"]) });

        await expect(client.embed({ model: "voyage-3", input: "hi" })).rejects.toBeInstanceOf(ClientRequestError);
    });
});

describe("resolution failures", () => {
    test("with a Voyage API key they fall back to the API, warning once per model", async () => {
        const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
        const fetch = recordingFetch();
        const client = new VoyageAIClient({
            apiKey: "key",
            fetch,
            provider: failingProvider(new ProviderResolutionError("no endpoint")),
        });

        await client.embed({ model: "voyage-3", input: "hi" });
        await client.embed({ model: "voyage-3", input: "again" });

        expect(fetch.calls.map((call) => call.url)).toEqual([
            "https://api.voyageai.com/v1/embeddings",
            "https://api.voyageai.com/v1/embeddings",
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toBe(
            "Model 'voyage-3' could not be routed to provider 'fake' (no endpoint); falling back to the Voyage API.",
        );
    });

    test("without a Voyage API key they propagate", async () => {
        vi.stubEnv("VOYAGE_API_KEY", undefined as unknown as string);
        const client = new VoyageAIClient({
            fetch: recordingFetch(),
            provider: failingProvider(new ProviderResolutionError("no endpoint")),
        });

        await expect(client.embed({ model: "voyage-3", input: "hi" })).rejects.toBeInstanceOf(ProviderResolutionError);
    });

    test("other provider errors always propagate", async () => {
        const fetch = recordingFetch();
        const client = new VoyageAIClient({ apiKey: "key", fetch, provider: failingProvider(new Error("boom")) });

        await expect(client.embed({ model: "voyage-3", input: "hi" })).rejects.toThrow("boom");
        expect(fetch.calls).toHaveLength(0);
    });
});
