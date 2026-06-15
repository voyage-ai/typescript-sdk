/**
 * Extended VoyageAI client with local model support and client-side chunking
 */

import type * as VoyageAI from "../api/index.js";
import { VoyageAIClient as GeneratedClient } from "../Client.js";
import { HttpResponsePromise } from "../core/fetcher/HttpResponsePromise.js";
import { unknownRawResponse } from "../core/fetcher/RawResponse.js";
import { isLocalModel, localEmbed } from "../local/index.js";
import type { TokenizeResult } from "../local/tokenizer.js";
import { tokenizeTexts } from "../local/tokenizer.js";

export type ChunkFn = (text: string) => string[];

export interface ContextualizedEmbedOptions extends VoyageAI.ContextualizedEmbedRequest {
    chunkFn?: ChunkFn;
}

export interface ContextualizedEmbeddingsResultItem {
    index: number;
    embeddings: number[][];
    chunkTexts?: string[];
}

export interface ContextualizedEmbedResult {
    results: ContextualizedEmbeddingsResultItem[];
    totalTokens: number;
    chunkTexts?: string[][];
    chunkerVersion?: string;
    rawResponse: VoyageAI.ContextualizedEmbedResponse;
}

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
     * Contextualized embeddings with client-side chunking and server-side auto-chunking support.
     *
     * Returns a `ContextualizedEmbedResult` wrapping the API response with extracted
     * embeddings, chunk texts, and token counts — mirroring the Python SDK's
     * `ContextualizedEmbeddingsObject`.
     *
     * @param request - Embed request with optional `chunkFn` for client-side chunking.
     * @param requestOptions - Request-specific configuration.
     */
    // @ts-expect-error Return type narrowed from HttpResponsePromise to wrapped result
    public async contextualizedEmbed(
        request: ContextualizedEmbedOptions,
        requestOptions?: GeneratedClient.RequestOptions,
    ): Promise<ContextualizedEmbedResult> {
        const { chunkFn, ...apiRequest } = request;
        const normalizedRequest = validateAndNormalizeContextualizedInputs(apiRequest, chunkFn);

        const requestInputs = chunkFn
            ? applyChunking(normalizedRequest.inputs as string[][], chunkFn)
            : normalizedRequest.inputs;

        const response = await super.contextualizedEmbed(
            { ...normalizedRequest, inputs: requestInputs },
            requestOptions,
        );

        const clientChunkTexts = chunkFn ? (requestInputs as string[][]) : undefined;
        return buildContextualizedResult(response, clientChunkTexts);
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

export function buildContextualizedResult(
    response: VoyageAI.ContextualizedEmbedResponse,
    clientChunkTexts?: string[][],
): ContextualizedEmbedResult {
    const results: ContextualizedEmbeddingsResultItem[] = [];
    const serverTextsPerDoc: (string[] | undefined)[] = [];

    for (let i = 0; i < (response.data ?? []).length; i++) {
        const doc = response.data![i];
        const embeddings = (doc.data ?? []).map((chunk) => chunk.embedding ?? []);

        let chunkTexts: string[] | undefined;

        if (clientChunkTexts !== undefined) {
            chunkTexts = clientChunkTexts[i];
        } else {
            const perDocTexts = (doc.data ?? []).map((chunk) => chunk.text);
            if (perDocTexts.every((t) => t !== undefined)) {
                serverTextsPerDoc.push(perDocTexts as string[]);
                chunkTexts = perDocTexts as string[];
            } else if (perDocTexts.some((t) => t !== undefined)) {
                throw new Error(
                    `inputs[${i}] returned a partial set of chunk texts; expected text on every chunk or none`,
                );
            } else {
                serverTextsPerDoc.push(undefined);
                chunkTexts = undefined;
            }
        }

        results.push({ index: i, embeddings, chunkTexts });
    }

    let resultChunkTexts: string[][] | undefined;

    if (clientChunkTexts !== undefined) {
        resultChunkTexts = clientChunkTexts;
    } else if (serverTextsPerDoc.length > 0) {
        const populated = serverTextsPerDoc.filter((t): t is string[] => t !== undefined);
        if (populated.length > 0 && populated.length !== serverTextsPerDoc.length) {
            throw new Error("response returned chunk texts for some documents but not others; expected all-or-nothing");
        }
        if (populated.length > 0) {
            resultChunkTexts = populated;
        }
    }

    return {
        results,
        totalTokens: response.usage?.totalTokens ?? 0,
        chunkTexts: resultChunkTexts,
        chunkerVersion: response.chunkerVersion,
        rawResponse: response,
    };
}

function isFlatStringArray(inputs: string[][] | string[]): inputs is string[] {
    return inputs.length > 0 && inputs.every((item) => typeof item === "string");
}

export function validateAndNormalizeContextualizedInputs(
    request: VoyageAI.ContextualizedEmbedRequest,
    chunkFn?: ChunkFn,
): VoyageAI.ContextualizedEmbedRequest {
    const { inputs, inputType, enableAutoChunking, chunkSize, chunkOverlap } = request;

    if (chunkFn !== undefined && enableAutoChunking) {
        throw new Error("chunkFn cannot be combined with enableAutoChunking: true");
    }

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

export function applyChunking(inputs: string[][], chunkFn: ChunkFn): string[][] {
    return inputs.map((doc) => doc.flatMap((text) => chunkFn(text)));
}

const DEFAULT_CHUNK_SIZE = 2048;
const SEPARATORS = [
    "\n\n",
    "\n",
    "．", // Fullwidth full stop
    "。", // Ideographic full stop
    "，", // Fullwidth comma
    "、", // Ideographic comma
    ".",
    ",",
    " ",
    "​", // Zero-width space
    "",
];

function recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
    if (text.length <= chunkSize) {
        return [text];
    }

    const sep = separators[0];
    const remainingSeparators = separators.slice(1);

    if (sep === undefined || sep === "") {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }

    const parts = text.split(sep);
    const chunks: string[] = [];
    let current = "";

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const piece = i < parts.length - 1 ? part + sep : part;

        if (current.length + piece.length <= chunkSize) {
            current += piece;
        } else {
            if (current.length > 0) {
                chunks.push(current);
            }
            if (piece.length <= chunkSize) {
                current = piece;
            } else {
                const subChunks = recursiveSplit(piece, remainingSeparators, chunkSize);
                chunks.push(...subChunks.slice(0, -1));
                current = subChunks[subChunks.length - 1];
            }
        }
    }

    if (current.length > 0) {
        chunks.push(current);
    }

    return chunks;
}

function addOverlap(chunks: string[], overlap: number): string[] {
    if (overlap === 0 || chunks.length <= 1) return chunks;
    const result = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
        const prev = chunks[i - 1];
        const overlapText = prev.slice(-overlap);
        result.push(overlapText + chunks[i]);
    }
    return result;
}

export function defaultChunkFn(chunkSize: number = DEFAULT_CHUNK_SIZE, chunkOverlap: number = 0): ChunkFn {
    return (text: string): string[] => {
        if (text.length === 0) {
            return [text];
        }
        const chunks = recursiveSplit(text, SEPARATORS, chunkSize);
        return addOverlap(chunks, chunkOverlap);
    };
}
