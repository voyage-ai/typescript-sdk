/**
 * Local embedding using node-llama-cpp (llama.cpp) and the official voyage-4-nano GGUF.
 * Runs voyage-4-nano entirely locally - no API calls after initial model download.
 */

import type * as VoyageAI from "../api/index.js";
import {
    getModelConfig,
    getPromptForInputType,
    type LocalModelConfig,
    validateDimension,
    validatePrecision,
} from "./model-registry.js";

// node-llama-cpp is ESM-only and uses top-level await, so require() can't load it. A plain
// import() would be compiled to require() in the CommonJS build, so keep a native dynamic import.
const importEsm = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;

async function importNodeLlamaCpp(): Promise<any> {
    try {
        return await importEsm("node-llama-cpp");
    } catch (error: any) {
        // Test runners (vitest, jest) evaluate code in a VM without a dynamic import callback.
        if (error?.code !== "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING") {
            throw error;
        }
        return await import("node-llama-cpp");
    }
}

let nodeLlamaCppModule: any = null;

async function getNodeLlamaCpp(): Promise<any> {
    if (!nodeLlamaCppModule) {
        try {
            nodeLlamaCppModule = await importNodeLlamaCpp();
        } catch (error) {
            throw new Error(
                "Local models require node-llama-cpp. Install: npm i node-llama-cpp " +
                    `(${error instanceof Error ? error.message : String(error)})`
            );
        }
    }
    return nodeLlamaCppModule;
}

interface LoadedModel {
    model: any;
    context: any | null;
    contextSize: number;
    // Serializes calls: the embedding context is shared and may be recreated with a larger size.
    queue: Promise<unknown>;
}

// Loaded models (persist across calls)
const modelCache = new Map<string, Promise<LoadedModel>>();

function loadModel(config: LocalModelConfig): Promise<LoadedModel> {
    let loaded = modelCache.get(config.ggufModelUri);
    if (!loaded) {
        loaded = (async () => {
            const { getLlama, resolveModelFile } = await getNodeLlamaCpp();
            const modelPath = await resolveModelFile(config.ggufModelUri, { cli: false });
            const llama = await getLlama();
            const model = await llama.loadModel({ modelPath });
            return { model, context: null, contextSize: 0, queue: Promise.resolve() };
        })();
        loaded.catch(() => modelCache.delete(config.ggufModelUri));
        modelCache.set(config.ggufModelUri, loaded);
    }
    return loaded;
}

const CONTEXT_SIZE_STEP = 512;

/**
 * Embedding context that fits the given number of tokens. voyage-4-nano uses bidirectional
 * attention, so a whole input must be evaluated in a single batch: batch size = context size.
 */
async function getContext(loaded: LoadedModel, tokenCount: number, maxContextSize: number): Promise<any> {
    // getEmbeddingFor() requires the input to be strictly shorter than the context.
    const needed = Math.min(Math.ceil((tokenCount + 1) / CONTEXT_SIZE_STEP) * CONTEXT_SIZE_STEP, maxContextSize);
    if (loaded.context == null || loaded.contextSize < needed) {
        await loaded.context?.dispose();
        loaded.context = null;
        loaded.context = await loaded.model.createEmbeddingContext({ contextSize: needed, batchSize: needed });
        loaded.contextSize = needed;
    }
    return loaded.context;
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

    const loaded = await loadModel(config);
    const run = loaded.queue.then(() => embedWithModel(loaded, config, request, dimension));
    loaded.queue = run.catch(() => undefined);
    return run;
}

async function embedWithModel(
    loaded: LoadedModel,
    config: LocalModelConfig,
    request: VoyageAI.EmbedRequest,
    dimension: number,
): Promise<VoyageAI.EmbedResponse> {
    const prompt = getPromptForInputType(config, request.inputType);
    const rawInputs = Array.isArray(request.input) ? request.input : [request.input];
    // The model is trained with instruction prompts; token counts include them, as in the Python SDK.
    // The original tokenizer normalizes to NFC, llama.cpp doesn't, so do it here.
    const inputs = rawInputs.map((text) => (prompt + text).normalize("NFC"));

    const maxInputTokens = config.maxTokens - 1;
    const tokenized: any[][] = inputs.map((text, idx) => {
        if (text.length === 0) {
            throw new Error(`Input at index ${idx} is empty.`);
        }
        const tokens = loaded.model.tokenize(text, true);
        if (tokens.length <= maxInputTokens) {
            return tokens;
        }
        if (request.truncation === false) {
            throw new Error(
                `Input at index ${idx} has ${tokens.length} tokens, which exceeds the ` +
                    `${maxInputTokens} token limit of ${request.model}. Set truncation to true to truncate it.`
            );
        }
        return tokens.slice(0, maxInputTokens);
    });

    const longest = Math.max(...tokenized.map((tokens) => tokens.length));
    const context = await getContext(loaded, longest, config.maxTokens);

    const embeddings: number[][] = [];
    let totalTokens = 0;
    for (const tokens of tokenized) {
        const { vector } = await context.getEmbeddingFor(tokens);
        // Truncate to the requested Matryoshka dimension and re-normalize
        embeddings.push(normalize(Array.from(vector as ArrayLike<number>).slice(0, dimension)));
        totalTokens += tokens.length;
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
