/**
 * SageMaker-path error mapping (spec §7.5, §10 B3).
 *
 * The generated SDK only surfaces a single error class, `VoyageAIError`, carrying an
 * optional `statusCode` and `body`. Rather than introduce new public error classes
 * (NG4-style seamlessness), SageMaker errors are mapped onto `VoyageAIError` with the
 * appropriate `statusCode` (so callers/retries can branch on it) and a message that
 * always names the endpoint and region (B4).
 *
 * Retries: the shared fetcher (`requestWithRetries`) retries on HTTP 408/429/>=500
 * before this mapping runs, so `ThrottlingException` (HTTP 429) and
 * `ModelNotReadyException`/`ServiceUnavailable` (5xx) are retried by the same
 * controller that wraps the API path (spec R6).
 */

import type { RawResponse } from "../core/fetcher/RawResponse.js";
import { VoyageAIError } from "../errors/VoyageAIError.js";

/**
 * Thrown when a model cannot be resolved to a SageMaker endpoint (no candidate or
 * ambiguous). Distinct type so the client can decide to fall back to the API path
 * (spec R3) only for *resolution* failures — never for invoke or auth failures.
 */
export class SageMakerResolutionError extends VoyageAIError {
    constructor(message: string) {
        super({ message });
        Object.setPrototypeOf(this, SageMakerResolutionError.prototype);
        this.name = "SageMakerResolutionError";
    }
}

/**
 * Thrown when AWS rejects discovery/credentials (AccessDenied, no credentials, expired
 * token, ...). Never triggers API fallback — a credential problem should surface, not
 * be masked.
 */
export class SageMakerAuthError extends VoyageAIError {
    constructor(message: string) {
        super({ message });
        Object.setPrototypeOf(this, SageMakerAuthError.prototype);
        this.name = "SageMakerAuthError";
    }
}

function extractField(body: unknown, keys: readonly string[]): string | undefined {
    if (body == null || typeof body !== "object") {
        return undefined;
    }
    const record = body as Record<string, unknown>;
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return undefined;
}

const STANDARD_STATUS_HINT: Readonly<Record<number, string>> = {
    400: "invalid request",
    401: "authentication error",
    422: "malformed request",
    429: "rate limit exceeded",
};

/**
 * Map a non-OK SageMaker transport result onto a `VoyageAIError`. Detection branches on
 * the JSON error body (`ErrorCode` / `__type` / `Message` / `OriginalStatusCode` /
 * `OriginalMessage`) and the `x-amzn-ErrorType` header — see spec §10 B3.
 */
export function mapSageMakerError(args: {
    endpointName: string;
    region: string;
    statusCode: number;
    body: unknown;
    rawResponse: RawResponse;
}): VoyageAIError {
    const { endpointName, region, statusCode, body, rawResponse } = args;
    const suffix = ` (endpoint '${endpointName}', region '${region}')`;

    const amznErrorType = rawResponse.headers?.get?.("x-amzn-ErrorType") ?? undefined;
    const errorType = extractField(body, ["ErrorCode", "__type"]) ?? amznErrorType;
    const errorCode = (errorType ?? "").split(/[:#]/)[0] ?? "";
    const message = extractField(body, ["Message", "message", "OriginalMessage", "detail"]);

    const mk = (code: number, text: string): VoyageAIError =>
        new VoyageAIError({ statusCode: code, body, rawResponse, message: text + suffix });

    // HTTP 424 ModelError: re-map using the original status/message from the container.
    if (statusCode === 424 || errorCode === "ModelError") {
        const originalStatus = Number(extractField(body, ["OriginalStatusCode"]) ?? 0);
        const originalMessage = extractField(body, ["OriginalMessage", "Message"]) ?? "model error";
        const hint = STANDARD_STATUS_HINT[originalStatus] ?? "model error";
        return mk(originalStatus || statusCode, `SageMaker ${hint}: ${originalMessage}`);
    }

    // Throttling: RateLimit-equivalent so the shared retry controller retries it.
    if (errorCode === "ThrottlingException" || statusCode === 429) {
        return mk(429, "SageMaker throttling / rate limit exceeded");
    }

    // Validation error naming a missing endpoint.
    if (errorCode === "ValidationError" || errorCode === "ValidationException") {
        const text = (message ?? "").toLowerCase();
        if (text.includes("not found") || text.includes("could not") || text.includes("does not exist")) {
            return new VoyageAIError({
                statusCode: statusCode || 400,
                body,
                rawResponse,
                message: `SageMaker endpoint '${endpointName}' not found in region '${region}'.`,
            });
        }
        return mk(statusCode || 400, `SageMaker validation error: ${message ?? "invalid request"}`);
    }

    // Credential / signature failures.
    if (
        statusCode === 403 ||
        errorCode === "InvalidSignatureException" ||
        errorCode === "ExpiredTokenException" ||
        errorCode === "UnrecognizedClientException" ||
        errorCode === "AccessDeniedException"
    ) {
        return mk(statusCode || 403, `SageMaker authentication error: ${message ?? errorCode}`);
    }

    // Model not ready is retryable; other 500s are server errors.
    if (errorCode === "ModelNotReadyException") {
        return mk(503, "SageMaker model not ready");
    }
    if (statusCode === 503 || statusCode === 502 || statusCode === 504 || errorCode === "ServiceUnavailable") {
        return mk(statusCode || 503, "SageMaker service unavailable");
    }
    if (statusCode === 500 || errorCode === "InternalFailure") {
        return mk(500, `SageMaker internal failure: ${message ?? "server error"}`);
    }

    return mk(statusCode, `SageMaker request failed: ${message ?? errorCode ?? "unknown error"}`);
}
