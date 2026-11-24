/**
 * The provider seam: how a non-Voyage-API backend plugs into the SDK.
 *
 * Any backend other than the Voyage API (AWS SageMaker today, Azure or GCP tomorrow) is a
 * *provider*: an object that maps a model name to a {@link Transport}. A transport makes one
 * backend endpoint look like the Voyage API at the HTTP level — where to send the request, how to
 * sign it, and how to turn the backend's response into the response the Voyage API would have
 * sent. Everything else (serialization, retries, timeouts, logging, typed errors) is the
 * generated client's, unchanged.
 *
 * A provider is always explicit: passed to the client —
 * `new VoyageAIClient({ provider: sagemakerProvider({ region: "us-east-1" }) })` — or configured by
 * a provider-specific client such as `SageMakerVoyageAIClient`. Without one, every call goes to
 * the Voyage API exactly as before.
 *
 * Kept in lockstep with the Python SDK's `voyageai_cloud.providers` module.
 */

import { VoyageAIError } from "../errors/index.js";

/** Client operations a transport may serve. */
export type VoyageOperation = "embed" | "rerank" | "multimodalEmbed" | "contextualizedEmbed";

/** Voyage API request path per operation, used when a transport overrides neither. */
const DEFAULT_OPERATION_PATHS: Readonly<Record<VoyageOperation, string>> = {
    embed: "/embeddings",
    rerank: "/rerank",
    multimodalEmbed: "/multimodalembeddings",
    contextualizedEmbed: "/contextualizedembeddings",
};

/** Read access to response headers, as handed to a {@link ProviderResponseHandler}. */
export interface ResponseHeaders {
    get(name: string): string | null;
}

/**
 * Decides the final header set emitted for a request. Receives the headers the generated client
 * assembled (minus the Voyage API `Authorization` header) and returns the ones to send, so a
 * strategy can add, replace, or drop any of them (SigV4 signing needs the method, URL, and exact
 * body). Called once per attempt, so every retry is signed afresh.
 */
export interface AuthStrategy {
    buildHeaders(
        method: string,
        url: string,
        body: string | undefined,
        headers: Record<string, string>,
    ): Promise<Record<string, string>>;
}

/** A backend response re-expressed as the response the Voyage API would have sent. */
export interface VoyageApiResponse {
    readonly status: number;
    /** JSON body: the Voyage response envelope on success, a `{ detail }` error body otherwise. */
    readonly body: unknown;
}

/**
 * Translates a raw backend response into a {@link VoyageApiResponse}.
 *
 * The handler owns the backend's status semantics entirely. Whatever it returns is handed to the
 * generated client as if the Voyage API had sent it, so its status code decides retries
 * (408/429/5xx) and the error class (`ClientRequestError` for 400, `ServerError` for 500,
 * `VoyageAIError` otherwise), and a success body must match the Voyage response envelope.
 */
export type ProviderResponseHandler = (status: number, body: unknown, headers: ResponseHeaders) => VoyageApiResponse;

/**
 * Everything needed to talk to one resolved backend endpoint.
 * Field semantics are shared with the Python SDK's `Transport` dataclass.
 */
export interface Transport {
    /** Absolute base URL of the resolved backend endpoint. */
    readonly baseUrl: string;
    /** Header/signing strategy for this endpoint. */
    readonly auth: AuthStrategy;
    /** Fixed request path for all operations (e.g. SageMaker's `/invocations`). */
    readonly path?: string;
    /** Per-operation path overrides; wins over `path`. */
    readonly paths?: Partial<Record<VoyageOperation, string>>;
    /** Optional wire-format hook applied to the serialized request body. */
    readonly requestAdapter?: (operation: VoyageOperation, body: string) => string;
    /** Response translator. Absent keeps the backend response as is (it already speaks the Voyage API). */
    readonly responseHandler?: ProviderResponseHandler;
}

/** Resolve the request path for one operation: `paths` > `path` > the operation's API default. */
export function pathFor(transport: Transport, operation: VoyageOperation): string {
    return transport.paths?.[operation] ?? transport.path ?? DEFAULT_OPERATION_PATHS[operation];
}

/**
 * Routes model names to transports.
 *
 * `resolve` returns `undefined` when the provider knowingly does not serve a model, which routes
 * the call to the Voyage API silently (its own auth rules apply). It throws
 * {@link ProviderResolutionError} when it *should* have served the model but could not; the client
 * turns that into a Voyage API fallback (warned once per model) if a Voyage API key is configured,
 * and re-throws otherwise.
 *
 * Resolution runs once per call, outside the retry loop, and is expected to be cached by the
 * provider; the first resolution may perform network I/O (endpoint discovery).
 */
export interface Provider {
    /** Provider alias used in the fallback warning (e.g. `"aws"`). */
    readonly name: string;
    resolve(model: string): Promise<Transport | undefined>;
}

/** Distinguishes "no/ambiguous endpoint" from "credentials rejected during discovery". */
export type ProviderResolutionErrorKind = "invalid_request" | "authentication";

/**
 * Identity of {@link ProviderResolutionError} that survives a second copy of the SDK (a CJS
 * process that also loads the ESM build, or a nested install), where `instanceof` cannot.
 */
const PROVIDER_RESOLUTION_ERROR_BRAND = Symbol.for("voyageai.ProviderResolutionError");

/**
 * Thrown by a provider's `resolve` when it should have served a model but could not — a missing
 * endpoint, an ambiguous match, or a permission failure during discovery. This is the ONLY error
 * the client downgrades to a Voyage API fallback; errors after resolution always propagate.
 */
export class ProviderResolutionError extends VoyageAIError {
    public readonly kind: ProviderResolutionErrorKind;

    constructor(message: string, kind: ProviderResolutionErrorKind = "invalid_request") {
        super({ message });
        Object.setPrototypeOf(this, ProviderResolutionError.prototype);
        this.name = "ProviderResolutionError";
        this.kind = kind;
        (this as unknown as Record<symbol, boolean>)[PROVIDER_RESOLUTION_ERROR_BRAND] = true;
    }
}

/** True when `error` is a {@link ProviderResolutionError}, including one from another copy of the SDK. */
export function isProviderResolutionError(error: unknown): error is ProviderResolutionError {
    return (
        error instanceof ProviderResolutionError ||
        (typeof error === "object" && error !== null && PROVIDER_RESOLUTION_ERROR_BRAND in error)
    );
}
