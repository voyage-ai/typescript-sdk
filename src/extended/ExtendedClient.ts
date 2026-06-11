/**
 * Extended VoyageAI client with local model support
 */

import type * as VoyageAI from "../api/index.js";
import { VoyageAIClient as GeneratedClient } from "../Client.js";
import { HttpResponsePromise } from "../core/fetcher/HttpResponsePromise.js";
import { unknownRawResponse } from "../core/fetcher/RawResponse.js";
import { isLocalModel, localEmbed } from "../local/index.js";
import type { TokenizeResult } from "../local/tokenizer.js";
import { tokenizeTexts } from "../local/tokenizer.js";

export class VoyageAIClient extends GeneratedClient {
    /**
     * Voyage embedding endpoint receives as input a string (or a list of strings) and other arguments such as the preferred model name, and returns a response containing a list of embeddings.
     *
     * For local models (e.g., 'voyage-4-nano'), embeddings are computed locally using Transformers.js.
     * For all other models, the request is forwarded to the Voyage AI API.
     *
     * @param {VoyageAI.EmbedRequest} request
     * @param {GeneratedClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @example
     *     // Local embedding (no API key required)
     *     await client.embed({
     *         input: "hello world",
     *         model: "voyage-4-nano"
     *     })
     *
     * @example
     *     // API embedding
     *     await client.embed({
     *         input: "hello world",
     *         model: "voyage-3-large"
     *     })
     */
    public embed(
        request: VoyageAI.EmbedRequest,
        requestOptions?: GeneratedClient.RequestOptions,
    ): HttpResponsePromise<VoyageAI.EmbedResponse> {
        if (isLocalModel(request.model)) {
            return HttpResponsePromise.fromPromise(
                localEmbed(request).then((data) => ({ data, rawResponse: unknownRawResponse })),
            );
        }
        return super.embed(request, requestOptions);
    }

    /**
     * Contextualized embeddings with auto-chunking support.
     *
     * Validates and normalizes inputs before forwarding to the API.
     * Flat `string[]` inputs are normalized to `string[][]` (one string per document).
     *
     * @param {VoyageAI.ContextualizedEmbedRequest} request
     * @param {GeneratedClient.RequestOptions} requestOptions - Request-specific configuration.
     */
    public contextualizedEmbed(
        request: VoyageAI.ContextualizedEmbedRequest,
        requestOptions?: GeneratedClient.RequestOptions,
    ): HttpResponsePromise<VoyageAI.ContextualizedEmbedResponse> {
        const normalizedRequest = validateAndNormalizeContextualizedInputs(request);
        return super.contextualizedEmbed(normalizedRequest, requestOptions);
    }

    /**
     * Tokenize texts using the specified model's tokenizer.
     * Works with both local models (e.g., 'voyage-4-nano') and API models (e.g., 'voyage-3-large').
     *
     * @param texts - Array of strings to tokenize
     * @param model - Voyage model name
     * @returns Array of TokenizeResult, each containing tokens (string[]) and ids (number[])
     *
     * @example
     *     const results = await client.tokenize(["hello world"], "voyage-4-nano");
     *     console.log(results[0].tokens); // ["hello", "world"]
     *     console.log(results[0].ids);    // [123, 456]
     */
    public async tokenize(texts: string[], model: string): Promise<TokenizeResult[]> {
        return tokenizeTexts(model, texts);
    }
}

function isFlatStringArray(inputs: string[][] | string[]): inputs is string[] {
    return inputs.length > 0 && inputs.every((item) => typeof item === "string");
}

export function validateAndNormalizeContextualizedInputs(
    request: VoyageAI.ContextualizedEmbedRequest,
): VoyageAI.ContextualizedEmbedRequest {
    const { inputs, inputType, enableAutoChunking, chunkSize, chunkOverlap } = request;

    const hasChunkSize = chunkSize !== undefined && chunkSize !== null;
    const hasChunkOverlap = chunkOverlap !== undefined && chunkOverlap !== null;

    if (!enableAutoChunking && (hasChunkSize || hasChunkOverlap)) {
        throw new Error("chunkSize and chunkOverlap require enableAutoChunking: true");
    }

    if (hasChunkSize && hasChunkOverlap && chunkOverlap >= chunkSize) {
        throw new Error(`chunkOverlap (${chunkOverlap}) must be less than chunkSize (${chunkSize})`);
    }

    if (hasChunkSize && chunkSize < 1) {
        throw new Error("chunkSize must be greater than or equal to 1");
    }

    if (hasChunkOverlap && chunkOverlap < 0) {
        throw new Error("chunkOverlap must be greater than or equal to 0");
    }

    if (hasChunkOverlap && !hasChunkSize) {
        throw new Error("chunkOverlap requires chunkSize");
    }

    if (!inputs || inputs.length === 0) {
        throw new Error("inputs must not be empty");
    }

    let normalizedInputs: string[][];

    if (isFlatStringArray(inputs)) {
        if (inputType !== "query" && !enableAutoChunking) {
            throw new Error("Flat string[] inputs require enableAutoChunking: true or inputType: 'query'");
        }
        normalizedInputs = inputs.map((s) => [s]);
    } else {
        normalizedInputs = inputs;
    }

    if (enableAutoChunking) {
        if (inputType !== "document") {
            throw new Error("enableAutoChunking: true requires inputType: 'document'");
        }
        for (let i = 0; i < normalizedInputs.length; i++) {
            if (normalizedInputs[i].length !== 1) {
                throw new Error(
                    `inputs[${i}] has ${normalizedInputs[i].length} chunks; auto-chunking expects one string per document`,
                );
            }
        }
    }

    return { ...request, inputs: normalizedInputs };
}
