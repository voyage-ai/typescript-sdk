/**
 * Extended VoyageAI client with local model support and client-side chunking
 */

import type * as VoyageAI from "../api/index.js";
import type { BaseClientOptions } from "../BaseClient.js";
import { VoyageAIClient as GeneratedClient } from "../Client.js";
import { HttpResponsePromise } from "../core/fetcher/HttpResponsePromise.js";
import type { WithRawResponse } from "../core/fetcher/RawResponse.js";
import { unknownRawResponse } from "../core/fetcher/RawResponse.js";
import { toJson } from "../core/json.js";
import type { SchemaOptions } from "../core/schemas/index.js";
import { isLocalModel, localEmbed } from "../local/index.js";
import type { TokenizeResult } from "../local/tokenizer.js";
import { tokenizeTexts } from "../local/tokenizer.js";
import type { AwsSagemakerOptions } from "../sagemaker/config.js";
import { resolveSageMakerConfig } from "../sagemaker/config.js";
import { SageMakerResolutionError } from "../sagemaker/errors.js";
import type { SageMakerRequestOptions } from "../sagemaker/runtime.js";
import { SageMakerRuntime } from "../sagemaker/runtime.js";
import * as serializers from "../serialization/index.js";

export type ChunkFn = (text: string) => string[];

/** Options accepted by the extended client, adding SageMaker activation to the base set. */
export interface ExtendedClientOptions extends BaseClientOptions {
    /**
     * Activate the AWS SageMaker path. Pass an (optionally empty) object to route calls to
     * SageMaker endpoints instead of the Voyage API. Region and credentials fall back to
     * the standard AWS environment / default chain. When omitted, the `VOYAGE_SAGEMAKER`
     * environment variable is consulted instead (constructor always wins).
     */
    awsSagemaker?: AwsSagemakerOptions;
}

const RESPONSE_PARSE_OPTIONS: SchemaOptions = {
    unrecognizedObjectKeys: "passthrough",
    allowUnrecognizedUnionMembers: true,
    allowUnrecognizedEnumValues: true,
    skipValidation: true,
    breadcrumbsPrefix: ["response"],
};

const REQUEST_SERIALIZE_OPTIONS: SchemaOptions = {
    unrecognizedObjectKeys: "strip",
    omitUndefined: true,
};

function apiKeyConfigured(options: ExtendedClientOptions): boolean {
    if (options.apiKey != null) {
        return true;
    }
    return typeof process !== "undefined" && process.env?.VOYAGE_API_KEY != null;
}

/**
 * Normalize a SageMaker embed/multimodal response body to the Voyage API envelope.
 *
 * Some legacy SageMaker Marketplace containers (e.g. the `voyage-multimodal-3` package)
 * return `data` as a list of bare float arrays instead of `{ object, embedding, index }`
 * objects. Wrap those so callers always get the same `data[i].embedding` shape regardless
 * of which endpoint served the request. Bodies already in object form pass through untouched,
 * so this is a no-op for current endpoints and for the Voyage API path.
 */
function normalizeSageMakerEmbeddingBody(body: unknown): unknown {
    if (body == null || typeof body !== "object") {
        return body;
    }
    const obj = body as { data?: unknown };
    if (!Array.isArray(obj.data)) {
        return body;
    }
    let mutated = false;
    const data = obj.data.map((item, index) => {
        if (Array.isArray(item)) {
            mutated = true;
            return { object: "embedding", embedding: item, index };
        }
        return item;
    });
    return mutated ? { ...obj, data } : body;
}

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
     * SageMaker runtime, present only when the SageMaker path is activated (via the
     * `awsSagemaker` option or the `VOYAGE_SAGEMAKER` env var). When absent, behavior is
     * byte-for-byte identical to the generated client.
     */
    protected readonly _sagemaker: SageMakerRuntime | undefined;

    constructor(options: ExtendedClientOptions = {}) {
        const { awsSagemaker, ...baseOptions } = options;
        super(baseOptions);
        const config = resolveSageMakerConfig(awsSagemaker);
        this._sagemaker =
            config === undefined ? undefined : new SageMakerRuntime(config, { hasApiKey: apiKeyConfigured(options) });
    }

    /**
     * Voyage embedding endpoint receives as input a string (or a list of strings) and other arguments such as the preferred model name, and returns a response containing a list of embeddings.
     *
     * For local models (e.g., 'voyage-4-nano'), embeddings are computed locally using Transformers.js.
     * When the SageMaker path is active, the model is resolved to a SageMaker endpoint.
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
        // R2: local model beats SageMaker (embed only), unchanged.
        if (isLocalModel(request.model)) {
            return HttpResponsePromise.fromPromise(
                localEmbed(request).then((data) => ({ data, rawResponse: unknownRawResponse })),
            );
        }
        if (this._sagemaker !== undefined) {
            return HttpResponsePromise.fromPromise(this.embedViaSageMaker(this._sagemaker, request, requestOptions));
        }
        return super.embed(request, requestOptions);
    }

    /**
     * Voyage reranker endpoint. Routed to a SageMaker endpoint when the SageMaker path is
     * active, otherwise forwarded to the Voyage API.
     */
    public rerank(
        request: VoyageAI.RerankRequest,
        requestOptions?: GeneratedClient.RequestOptions,
    ): HttpResponsePromise<VoyageAI.RerankResponse> {
        if (this._sagemaker !== undefined) {
            const sm = this._sagemaker;
            return HttpResponsePromise.fromPromise(
                this.runViaSageMaker(
                    sm,
                    request.model,
                    () => toJson(serializers.RerankRequest.jsonOrThrow(request, REQUEST_SERIALIZE_OPTIONS)),
                    (body) => serializers.RerankResponse.parseOrThrow(body, RESPONSE_PARSE_OPTIONS),
                    () => super.rerank(request, requestOptions),
                    requestOptions,
                ),
            );
        }
        return super.rerank(request, requestOptions);
    }

    /**
     * Voyage multimodal embedding endpoint. Routed to a SageMaker endpoint when the
     * SageMaker path is active, otherwise forwarded to the Voyage API.
     */
    public multimodalEmbed(
        request: VoyageAI.MultimodalEmbedRequest,
        requestOptions?: GeneratedClient.RequestOptions,
    ): HttpResponsePromise<VoyageAI.MultimodalEmbedResponse> {
        if (this._sagemaker !== undefined) {
            const sm = this._sagemaker;
            return HttpResponsePromise.fromPromise(
                this.runViaSageMaker(
                    sm,
                    request.model,
                    () => toJson(serializers.MultimodalEmbedRequest.jsonOrThrow(request, REQUEST_SERIALIZE_OPTIONS)),
                    (body) =>
                        serializers.MultimodalEmbedResponse.parseOrThrow(
                            normalizeSageMakerEmbeddingBody(body),
                            RESPONSE_PARSE_OPTIONS,
                        ),
                    () => super.multimodalEmbed(request, requestOptions),
                    requestOptions,
                ),
            );
        }
        return super.multimodalEmbed(request, requestOptions);
    }

    /**
     * Contextualized embeddings with client-side chunking and server-side auto-chunking support.
     *
     * Returns a `ContextualizedEmbedResult` wrapping the API response with extracted
     * embeddings, chunk texts, and token counts — mirroring the Python SDK's
     * `ContextualizedEmbeddingsObject`. Input validation and chunking run identically on
     * both the API and SageMaker paths.
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
        const finalRequest = { ...normalizedRequest, inputs: requestInputs };
        const clientChunkTexts = chunkFn ? (requestInputs as string[][]) : undefined;

        const sm = this._sagemaker;
        if (sm !== undefined) {
            const endpoint = await this.resolveOrFallback(sm, finalRequest.model);
            if (endpoint !== undefined) {
                const bodyString = toJson(
                    serializers.ContextualizedEmbedRequest.jsonOrThrow(finalRequest, REQUEST_SERIALIZE_OPTIONS),
                );
                const { body } = await sm.invoke(endpoint, bodyString, this.sageMakerRequestOptions(requestOptions));
                const response = serializers.ContextualizedEmbedResponse.parseOrThrow(body, RESPONSE_PARSE_OPTIONS);
                return buildContextualizedResult(response, clientChunkTexts);
            }
        }

        const response = await super.contextualizedEmbed(finalRequest, requestOptions);
        return buildContextualizedResult(response, clientChunkTexts);
    }

    private sageMakerRequestOptions(requestOptions?: GeneratedClient.RequestOptions): SageMakerRequestOptions {
        return {
            timeoutInSeconds: requestOptions?.timeoutInSeconds ?? this._options?.timeoutInSeconds,
            maxRetries: requestOptions?.maxRetries ?? this._options?.maxRetries,
            abortSignal: requestOptions?.abortSignal,
            fetch: this._options?.fetch,
            logging: this._options.logging,
        };
    }

    /**
     * Resolve `model` to an endpoint, or return `undefined` to signal the caller should
     * fall back to the API path. A no-candidate/ambiguous resolution error triggers the
     * fallback (with a one-time warning) only when an API key is configured; otherwise it
     * propagates. Invoke/auth errors always propagate.
     */
    private async resolveOrFallback(sm: SageMakerRuntime, model: string): Promise<string | undefined> {
        try {
            return await sm.resolveEndpoint(model);
        } catch (error) {
            if (error instanceof SageMakerResolutionError && sm.hasApiKey) {
                sm.warnOnce(model, (error as Error).message);
                return undefined;
            }
            throw error;
        }
    }

    private async embedViaSageMaker(
        sm: SageMakerRuntime,
        request: VoyageAI.EmbedRequest,
        requestOptions?: GeneratedClient.RequestOptions,
    ): Promise<WithRawResponse<VoyageAI.EmbedResponse>> {
        const endpoint = await this.resolveOrFallback(sm, request.model);
        if (endpoint === undefined) {
            return super.embed(request, requestOptions).withRawResponse();
        }
        const bodyString = toJson(serializers.EmbedRequest.jsonOrThrow(request, REQUEST_SERIALIZE_OPTIONS));
        const { body, rawResponse } = await sm.invoke(
            endpoint,
            bodyString,
            this.sageMakerRequestOptions(requestOptions),
        );
        const data = serializers.EmbedResponse.parseOrThrow(
            normalizeSageMakerEmbeddingBody(body),
            RESPONSE_PARSE_OPTIONS,
        );
        return { data, rawResponse };
    }

    private async runViaSageMaker<TResp>(
        sm: SageMakerRuntime,
        model: string,
        serializeBody: () => string,
        parseResponse: (body: unknown) => TResp,
        apiFallback: () => HttpResponsePromise<TResp>,
        requestOptions?: GeneratedClient.RequestOptions,
    ): Promise<WithRawResponse<TResp>> {
        const endpoint = await this.resolveOrFallback(sm, model);
        if (endpoint === undefined) {
            return apiFallback().withRawResponse();
        }
        const { body, rawResponse } = await sm.invoke(
            endpoint,
            serializeBody(),
            this.sageMakerRequestOptions(requestOptions),
        );
        return { data: parseResponse(body), rawResponse };
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
