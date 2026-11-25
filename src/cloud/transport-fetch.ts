/**
 * Runs a {@link Transport} underneath the generated client.
 *
 * The generated client already does everything a provider call needs — request serialization,
 * retries with backoff, timeouts, abort signals, logging, response parsing, typed errors — and
 * accepts a custom `fetch`. So a transport is plugged in as that `fetch`: the generated client
 * builds a Voyage API request, and this function re-targets it at the backend endpoint, signs it,
 * and translates the backend's answer back into a Voyage API response. The generated code is used
 * as is; nothing here depends on its internals beyond the public `fetch` option.
 *
 * Called once per attempt by the generated retry loop, so each retry is signed afresh, and a
 * translated 408/429/5xx status is retried exactly like one from the Voyage API.
 */

import { type ProviderResponseHandler, pathFor, type Transport, type VoyageOperation } from "./providers.js";

/** Last path segment of each generated endpoint, mapped to the client operation. */
const OPERATION_BY_ENDPOINT: Readonly<Record<string, VoyageOperation>> = {
    embeddings: "embed",
    rerank: "rerank",
    multimodalembeddings: "multimodalEmbed",
    contextualizedembeddings: "contextualizedEmbed",
};

function operationFor(pathname: string): VoyageOperation {
    const endpoint = pathname.split("/").filter(Boolean).pop() ?? "";
    const operation = OPERATION_BY_ENDPOINT[endpoint];
    if (operation === undefined) {
        throw new Error(`No provider operation for request path '${pathname}'.`);
    }
    return operation;
}

function joinUrl(baseUrl: string, path: string): string {
    const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return path.startsWith("/") ? trimmedBase + path : `${trimmedBase}/${path}`;
}

function requestUrl(input: unknown): URL {
    if (typeof input === "string" || input instanceof URL) {
        return new URL(String(input));
    }
    return new URL((input as { url: string }).url);
}

/**
 * The generated client's headers as a plain record, without `Authorization` (the Voyage API
 * bearer token must never reach another backend) and without `Host` (fetch derives it from the URL).
 */
function forwardedHeaders(init: HeadersInit | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    new Headers(init).forEach((value, name) => {
        if (name !== "authorization" && name !== "host") {
            headers[name] = value;
        }
    });
    return headers;
}

function withoutHost(headers: Record<string, string>): Record<string, string> {
    // A SigV4 signature stays valid without it: AWS recomputes the canonical request from the
    // Host it actually receives, and fetch sets that from the URL.
    const { host: _host, Host: _Host, ...rest } = headers;
    return rest;
}

async function readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** Re-express a backend response as the Voyage API response the generated client expects. */
async function translateResponse(handler: ProviderResponseHandler, response: Response, url: string): Promise<Response> {
    const translated = handler(response.status, await readBody(response), response.headers);
    // `Response` only accepts 200-599; anything else is not a status the API could have sent.
    const status = translated.status >= 200 && translated.status <= 599 ? translated.status : 502;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-type", "application/json");
    const result = new Response(translated.body === undefined ? null : JSON.stringify(translated.body), {
        status,
        statusText: status === response.status ? response.statusText : "",
        headers,
    });
    // Keep `withRawResponse().rawResponse.url` pointing at the endpoint that actually answered.
    Object.defineProperty(result, "url", { value: response.url || url });
    return result;
}

/**
 * Build the `fetch` the generated client uses for one resolved transport.
 *
 * @param transport - The resolved backend endpoint.
 * @param baseFetch - The application's own `fetch` option, if any; the global `fetch` otherwise.
 */
export function createTransportFetch(transport: Transport, baseFetch?: typeof fetch): typeof fetch {
    const transportFetch = async (input: unknown, init: RequestInit = {}): Promise<Response> => {
        const requested = requestUrl(input);
        const operation = operationFor(requested.pathname);
        const target = new URL(joinUrl(transport.baseUrl, pathFor(transport, operation)));
        target.search = requested.search;
        const url = target.toString();

        if (init.body != null && typeof init.body !== "string") {
            throw new Error("Provider requests need a string body.");
        }
        const serialized = init.body ?? undefined;
        const body =
            serialized !== undefined && transport.requestAdapter !== undefined
                ? transport.requestAdapter(operation, serialized)
                : serialized;
        const method = init.method ?? "POST";
        const headers = withoutHost(
            await transport.auth.buildHeaders(method, url, body, forwardedHeaders(init.headers)),
        );

        const response = await (baseFetch ?? fetch)(url, { ...init, method, headers, body });
        return transport.responseHandler === undefined
            ? response
            : translateResponse(transport.responseHandler, response, url);
    };
    return transportFetch as typeof fetch;
}
