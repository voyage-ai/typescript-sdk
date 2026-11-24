/**
 * SageMaker invoke-path error mapping.
 *
 * A failed SageMaker invocation is re-expressed as the error response the Voyage API would have
 * sent: a status code callers and the retry loop can branch on, and a `{ detail }` body whose
 * message always names the endpoint and region (the original SageMaker body is kept as
 * `sagemaker_error`). The generated client then raises its usual typed error for it —
 * `ClientRequestError` for 400, `ServerError` for 500, `VoyageAIError` otherwise.
 *
 * Retries: the generated client retries HTTP 408/429/>=500 on the *mapped* status, so
 * `ThrottlingException` (429) and `ModelNotReadyException`/`ServiceUnavailable` (5xx) are retried
 * transparently, while a container-side 4xx wrapped in a 424 `ModelError` is not.
 *
 * Resolution errors are a different animal (`ProviderResolutionError`, raised by the resolver).
 */

import type { ResponseHeaders, VoyageApiResponse } from "../providers.js";

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
 * Map a non-OK SageMaker response onto a Voyage API error response. Detection branches on the
 * JSON error body (`ErrorCode` / `__type` / `Message` / `OriginalStatusCode` / `OriginalMessage`)
 * and the `x-amzn-ErrorType` header.
 */
export function mapSageMakerError(args: {
    endpointName: string;
    region: string;
    statusCode: number;
    body: unknown;
    headers: ResponseHeaders;
}): VoyageApiResponse {
    const { endpointName, region, statusCode, body, headers } = args;
    const suffix = ` (endpoint '${endpointName}', region '${region}')`;

    const amznErrorType = headers.get("x-amzn-ErrorType") ?? undefined;
    const errorType = extractField(body, ["ErrorCode", "__type"]) ?? amznErrorType;
    // `__type` is `namespace#ErrorName`; `x-amzn-ErrorType` is `ErrorName:http://...`.
    const errorCode = (errorType ?? "").split("#").pop()?.split(":")[0] ?? "";
    const message = extractField(body, ["Message", "message", "OriginalMessage", "detail"]);

    const respond = (status: number, detail: string): VoyageApiResponse => ({
        status,
        body: body === undefined ? { detail } : { detail, sagemaker_error: body },
    });
    const mk = (status: number, text: string): VoyageApiResponse => respond(status, text + suffix);

    // HTTP 424 ModelError: re-map using the original status/message from the container.
    if (statusCode === 424 || errorCode === "ModelError") {
        const originalStatus = Number(extractField(body, ["OriginalStatusCode"]) ?? 0);
        const originalMessage = extractField(body, ["OriginalMessage", "Message"]) ?? "model error";
        const hint = STANDARD_STATUS_HINT[originalStatus] ?? "model error";
        return mk(originalStatus || statusCode, `SageMaker ${hint}: ${originalMessage}`);
    }

    // Throttling: rate-limit status so the generated retry loop retries it.
    if (errorCode === "ThrottlingException" || statusCode === 429) {
        return mk(429, "SageMaker throttling / rate limit exceeded");
    }

    // Missing endpoint: the runtime reports `ErrorCode: NO_SUCH_ENDPOINT` (observed live);
    // older/other paths phrase it as a validation error naming the endpoint.
    const notFoundText = (message ?? "").toLowerCase();
    const validationNotFound =
        (errorCode === "ValidationError" || errorCode === "ValidationException") &&
        (notFoundText.includes("not found") ||
            notFoundText.includes("could not") ||
            notFoundText.includes("does not exist"));
    if (errorCode === "NO_SUCH_ENDPOINT" || validationNotFound) {
        return respond(statusCode || 400, `SageMaker endpoint '${endpointName}' not found in region '${region}'.`);
    }
    if (errorCode === "ValidationError" || errorCode === "ValidationException") {
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

    return mk(statusCode, `SageMaker request failed: ${message ?? (errorCode || "unknown error")}`);
}
