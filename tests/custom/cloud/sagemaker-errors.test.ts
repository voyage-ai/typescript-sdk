/**
 * SageMaker invoke-error mapping. Verifies status remap + message shape of the Voyage API error
 * response each SageMaker failure is translated into.
 */

import { mapSageMakerError } from "../../../src/cloud/aws/errors";
import { ProviderResolutionError } from "../../../src/cloud/providers";
import { VoyageAIError } from "../../../src/errors";

interface Mapped {
    statusCode: number;
    message: string;
    body: unknown;
}

/** The mapped response, read the way callers see it: status code and the `detail` message. */
function mapWith(statusCode: number, body: unknown, headers: Record<string, string> = {}): Mapped {
    const response = mapSageMakerError({
        endpointName: "ep-1",
        region: "us-east-1",
        statusCode,
        body,
        headers: new Headers(headers),
    });
    return { statusCode: response.status, message: (response.body as { detail: string }).detail, body: response.body };
}

describe("mapSageMakerError", () => {
    test("message always names endpoint and region", () => {
        const err = mapWith(500, { __type: "InternalFailure", Message: "boom" });
        expect(err.message).toContain("endpoint 'ep-1'");
        expect(err.message).toContain("region 'us-east-1'");
    });

    test("424 ModelError remaps to original status", () => {
        const err = mapWith(424, {
            ErrorCode: "ModelError",
            OriginalStatusCode: 429,
            OriginalMessage: "too many",
        });
        expect(err.statusCode).toBe(429);
        expect(err.message).toContain("rate limit");
    });

    test("throttling -> 429", () => {
        const err = mapWith(400, { __type: "ThrottlingException" });
        expect(err.statusCode).toBe(429);
    });

    test("HTTP 429 -> 429", () => {
        expect(mapWith(429, {}).statusCode).toBe(429);
    });

    test("ValidationError not-found -> endpoint not found", () => {
        const err = mapWith(400, { __type: "ValidationError", Message: "Endpoint ep-1 could not be found" });
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain("not found");
    });

    test("NO_SUCH_ENDPOINT (live runtime shape) -> endpoint not found", () => {
        const err = mapWith(400, {
            ErrorCode: "NO_SUCH_ENDPOINT",
            Message: "Endpoint ep-1 of account 123456789012 not found.",
        });
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/^SageMaker endpoint 'ep-1' not found in region 'us-east-1'\./);
    });

    test("ValidationError generic", () => {
        const err = mapWith(400, { __type: "ValidationError", Message: "bad shape" });
        expect(err.message).toContain("validation error");
    });

    test("403 -> auth error", () => {
        const err = mapWith(403, { Message: "denied" });
        expect(err.statusCode).toBe(403);
        expect(err.message).toContain("authentication error");
    });

    test("InvalidSignatureException via header -> auth error", () => {
        const err = mapWith(400, {}, { "x-amzn-ErrorType": "InvalidSignatureException:" });
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain("authentication error");
    });

    test("ModelNotReady -> 503", () => {
        const err = mapWith(400, { __type: "ModelNotReadyException" });
        expect(err.statusCode).toBe(503);
    });

    test("503 service unavailable", () => {
        expect(mapWith(503, {}).statusCode).toBe(503);
    });

    test("500 internal failure", () => {
        const err = mapWith(500, { Message: "kaboom" });
        expect(err.statusCode).toBe(500);
        expect(err.message).toContain("kaboom");
    });
});

describe("Voyage API error body", () => {
    test("the original SageMaker body is kept next to the detail message", () => {
        const original = { __type: "InternalFailure", Message: "boom" };
        expect(mapWith(500, original).body).toEqual({
            detail: "SageMaker internal failure: boom (endpoint 'ep-1', region 'us-east-1')",
            sagemaker_error: original,
        });
    });

    test("an empty SageMaker body yields a detail-only body", () => {
        expect(mapWith(503, undefined).body).toEqual({
            detail: "SageMaker service unavailable (endpoint 'ep-1', region 'us-east-1')",
        });
    });
});

describe("resolution error class", () => {
    test("ProviderResolutionError is a VoyageAIError carrying its kind", () => {
        const err = new ProviderResolutionError("no endpoint");
        expect(err).toBeInstanceOf(VoyageAIError);
        expect(err).toBeInstanceOf(ProviderResolutionError);
        expect(err.name).toBe("ProviderResolutionError");
        expect(err.kind).toBe("invalid_request");
        expect(new ProviderResolutionError("denied", "authentication").kind).toBe("authentication");
    });
});

describe("mapSageMakerError edge shapes", () => {
    test("a null body falls back to the status-based message", () => {
        const err = mapWith(500, null);
        expect(err.statusCode).toBe(500);
        expect(err.message).toContain("SageMaker internal failure: server error");
    });

    test("424 without an original status keeps 424 and the generic hint", () => {
        const err = mapWith(424, { ErrorCode: "ModelError" });
        expect(err.statusCode).toBe(424);
        expect(err.message).toContain("SageMaker model error: model error");
    });

    test.each([
        [400, "invalid request"],
        [401, "authentication error"],
        [422, "malformed request"],
    ])("424 ModelError with original status %i uses the standard hint", (original, hint) => {
        const err = mapWith(424, { ErrorCode: "ModelError", OriginalStatusCode: original, OriginalMessage: "why" });
        expect(err.statusCode).toBe(original);
        expect(err.message).toContain(`SageMaker ${hint}: why`);
    });

    test("the x-amzn-ErrorType header is parsed past '#' and ':' separators", () => {
        expect(mapWith(400, {}, { "x-amzn-ErrorType": "com.amazon#ThrottlingException" }).statusCode).toBe(429);
        expect(mapWith(400, {}, { "x-amzn-ErrorType": "ExpiredTokenException:http://x" }).message).toContain(
            "authentication error: ExpiredTokenException",
        );
    });

    test("service unavailable and internal failure codes", () => {
        expect(mapWith(502, {}).message).toContain("service unavailable");
        expect(mapWith(504, {}).message).toContain("service unavailable");
        expect(mapWith(400, { __type: "ServiceUnavailable" }).message).toContain("service unavailable");
        expect(mapWith(400, { __type: "InternalFailure", Message: "x" }).statusCode).toBe(500);
    });

    test("ValidationException and detail/message field variants", () => {
        const err = mapWith(400, { __type: "ValidationException", detail: "Endpoint does not exist" });
        expect(err.message).toContain("not found");
        expect(mapWith(400, { __type: "ValidationException", message: "odd" }).message).toContain(
            "validation error: odd",
        );
    });

    test("unknown shapes keep the status and quote what is known", () => {
        expect(mapWith(418, { Message: "teapot" })).toMatchObject({ statusCode: 418 });
        expect(mapWith(418, { Message: "teapot" }).message).toContain("SageMaker request failed: teapot");
        expect(mapWith(418, {}).message).toContain("SageMaker request failed: unknown error");
        expect(mapWith(418, { __type: "Mystery" }).message).toContain("SageMaker request failed: Mystery");
    });
});
