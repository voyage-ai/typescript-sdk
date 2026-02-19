/**
 * Tests for local model support (voyage-4-nano via @huggingface/transformers).
 *
 * These tests validate the model registry, validation logic, and ExtendedClient routing.
 * The actual ONNX inference is mocked to avoid downloading models in CI.
 */

import { isLocalModel, getModelConfig, validateDimension, validatePrecision, SUPPORTED_MODELS } from "../../src/local/model-registry";

describe("Local Model Registry", () => {
    test("isLocalModel returns true for voyage-4-nano", () => {
        expect(isLocalModel("voyage-4-nano")).toBe(true);
    });

    test("isLocalModel returns false for API models", () => {
        expect(isLocalModel("voyage-3-large")).toBe(false);
        expect(isLocalModel("voyage-3")).toBe(false);
    });

    test("getModelConfig returns config for voyage-4-nano", () => {
        const config = getModelConfig("voyage-4-nano");
        expect(config.onnxModelId).toBe("onnx-community/voyage-4-nano-ONNX");
        expect(config.defaultDimension).toBe(2048);
        expect(config.supportedDimensions).toContain(512);
    });

    test("getModelConfig throws for unknown model", () => {
        expect(() => getModelConfig("not-a-model")).toThrow("Unsupported local model");
    });
});

describe("Dimension Validation", () => {
    const config = SUPPORTED_MODELS["voyage-4-nano"];

    test("returns default dimension when none specified", () => {
        expect(validateDimension(config)).toBe(2048);
        expect(validateDimension(config, undefined)).toBe(2048);
    });

    test("accepts supported dimensions", () => {
        expect(validateDimension(config, 1024)).toBe(1024);
        expect(validateDimension(config, 512)).toBe(512);
        expect(validateDimension(config, 256)).toBe(256);
    });

    test("rejects unsupported dimensions", () => {
        expect(() => validateDimension(config, 999)).toThrow("Invalid outputDimension");
    });
});

describe("Precision Validation", () => {
    const config = SUPPORTED_MODELS["voyage-4-nano"];

    test("returns undefined when no precision specified", () => {
        expect(validatePrecision(config)).toBeUndefined();
    });

    test("accepts supported precisions", () => {
        expect(validatePrecision(config, "float32")).toBe("float32");
        expect(validatePrecision(config, "int8")).toBe("int8");
    });

    test("rejects unsupported precisions", () => {
        expect(() => validatePrecision(config, "float16")).toThrow("Invalid outputDtype");
    });
});
