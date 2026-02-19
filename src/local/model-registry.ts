/**
 * Model configuration and registry for local models.
 * Mirrors Python SDK's voyageai/local/model_registry.py
 */

export interface LocalModelConfig {
    /** ONNX model ID on HuggingFace Hub */
    onnxModelId: string;
    /** Default embedding dimension */
    defaultDimension: number;
    /** Supported Matryoshka dimensions */
    supportedDimensions: number[];
    /** Supported output precisions */
    supportedPrecisions: string[];
    /** Maximum token context length */
    maxTokens: number;
}

export const SUPPORTED_MODELS: Record<string, LocalModelConfig> = {
    "voyage-4-nano": {
        onnxModelId: "onnx-community/voyage-4-nano-ONNX",
        defaultDimension: 2048,
        supportedDimensions: [2048, 1024, 512, 256],
        supportedPrecisions: ["float32", "int8", "uint8", "binary", "ubinary"],
        maxTokens: 32768,
    },
};

export function isLocalModel(model: string): boolean {
    return model in SUPPORTED_MODELS;
}

export function getModelConfig(model: string): LocalModelConfig {
    const config = SUPPORTED_MODELS[model];
    if (!config) {
        throw new Error(
            `Unsupported local model '${model}'. ` +
                `Supported models: ${Object.keys(SUPPORTED_MODELS).join(", ")}`
        );
    }
    return config;
}

export function validateDimension(config: LocalModelConfig, dimension?: number): number {
    if (dimension == null) {
        return config.defaultDimension;
    }
    if (!config.supportedDimensions.includes(dimension)) {
        throw new Error(
            `Invalid outputDimension ${dimension}. ` +
                `Supported dimensions: ${config.supportedDimensions.join(", ")}`
        );
    }
    return dimension;
}

export function validatePrecision(config: LocalModelConfig, precision?: string): string | undefined {
    if (precision == null) {
        return undefined;
    }
    if (!config.supportedPrecisions.includes(precision)) {
        throw new Error(
            `Invalid outputDtype '${precision}'. ` +
                `Supported dtypes: ${config.supportedPrecisions.join(", ")}`
        );
    }
    return precision;
}
