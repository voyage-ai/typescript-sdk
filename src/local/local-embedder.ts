/**
 * Local embedding using @huggingface/transformers (ONNX Runtime).
 * Runs voyage-4-nano entirely locally - no API calls after initial model download.
 */

import type * as VoyageAI from "../api";
import { getModelConfig, validateDimension, validatePrecision } from "./model-registry";

// Cached pipelines and tokenizers (persist across calls)
const pipelineCache = new Map<string, any>();
const tokenizerCache = new Map<string, any>();

// Lazily imported transformers module
let transformersModule: any = null;

async function getTransformers(): Promise<any> {
    if (!transformersModule) {
        try {
            transformersModule = await import("@huggingface/transformers");
        } catch {
            throw new Error(
                "Local model requires @huggingface/transformers. " +
                    "Install: npm i @huggingface/transformers onnxruntime-node"
            );
        }
    }
    return transformersModule;
}

async function getPipeline(onnxModelId: string): Promise<any> {
    let extractor = pipelineCache.get(onnxModelId);
    if (!extractor) {
        const { pipeline } = await getTransformers();
        extractor = await pipeline("feature-extraction", onnxModelId, { dtype: "fp32" });
        pipelineCache.set(onnxModelId, extractor);
    }
    return extractor;
}

async function getTokenizer(onnxModelId: string): Promise<any> {
    let tokenizer = tokenizerCache.get(onnxModelId);
    if (!tokenizer) {
        const { AutoTokenizer } = await getTransformers();
        tokenizer = await AutoTokenizer.from_pretrained(onnxModelId);
        tokenizerCache.set(onnxModelId, tokenizer);
    }
    return tokenizer;
}

function normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
}

export async function localEmbed(request: VoyageAI.EmbedRequest): Promise<VoyageAI.EmbedResponse> {
    const config = getModelConfig(request.model);
    const dimension = validateDimension(config, request.outputDimension);
    validatePrecision(config, request.outputDtype);

    const extractor = await getPipeline(config.onnxModelId);
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const embeddings: number[][] = [];
    for (const text of inputs) {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        // output is a Tensor; convert to flat array then truncate to requested dimension
        const fullVec: number[] = Array.from(output.data as Float32Array).slice(0, output.dims[1]);
        const truncated = fullVec.slice(0, dimension);
        // Re-normalize after Matryoshka truncation
        embeddings.push(normalize(truncated));
    }

    // Token counting via tokenizer
    const tokenizer = await getTokenizer(config.onnxModelId);
    let totalTokens = 0;
    for (const text of inputs) {
        const encoded = tokenizer(text);
        totalTokens += encoded.input_ids.size;
    }

    return {
        object: "list",
        model: request.model,
        data: embeddings.map((embedding, idx) => ({
            object: "embedding",
            embedding,
            index: idx,
        })),
        usage: { totalTokens },
    };
}

/**
 * Count tokens for texts using the model's tokenizer.
 */
export async function countTokens(model: string, texts: string[]): Promise<number> {
    const config = getModelConfig(model);
    const tokenizer = await getTokenizer(config.onnxModelId);
    let total = 0;
    for (const text of texts) {
        const encoded = tokenizer(text);
        total += encoded.input_ids.size;
    }
    return total;
}
