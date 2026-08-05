/**
 * SageMaker error mapping (spec §10 B3). Verifies status remap + message shape.
 */

import type { RawResponse } from "../../src/core/fetcher/RawResponse";
import { VoyageAIError } from "../../src/errors/VoyageAIError";
import { mapSageMakerError, SageMakerAuthError, SageMakerResolutionError } from "../../src/sagemaker/errors";

function rawResponse(headers: Record<string, string> = {}): RawResponse {
    return {
        headers: new Headers(headers),
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub for tests
    } as any;
}

function mapWith(statusCode: number, body: unknown, headers: Record<string, string> = {}): VoyageAIError {
    return mapSageMakerError({
        endpointName: "ep-1",
        region: "us-east-1",
        statusCode,
        body,
        rawResponse: rawResponse(headers),
    });
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

describe("error classes", () => {
    test("SageMakerResolutionError is a VoyageAIError", () => {
        const err = new SageMakerResolutionError("no endpoint");
        expect(err).toBeInstanceOf(VoyageAIError);
        expect(err).toBeInstanceOf(SageMakerResolutionError);
        expect(err.name).toBe("SageMakerResolutionError");
    });

    test("SageMakerAuthError is a VoyageAIError", () => {
        const err = new SageMakerAuthError("denied");
        expect(err).toBeInstanceOf(VoyageAIError);
        expect(err).toBeInstanceOf(SageMakerAuthError);
        expect(err.name).toBe("SageMakerAuthError");
    });
});
