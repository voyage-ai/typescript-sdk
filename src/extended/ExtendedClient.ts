/**
 * Extended VoyageAI client with local model support and client metadata headers
 */

import { VoyageAIClient as GeneratedClient } from "../Client";
import type * as VoyageAI from "../api";
import { mergeHeaders } from "../core/headers";
import { HttpResponsePromise } from "../core/fetcher/HttpResponsePromise";
import { unknownRawResponse } from "../core/fetcher/RawResponse";
import { localEmbed, isLocalModel } from "../local";
import { tokenizeTexts } from "../local/tokenizer";
import type { TokenizeResult } from "../local/tokenizer";
import { buildMetadataHeaders, formatWrapperHeader, type ClientMetadataEntry } from "./client-metadata";

export class VoyageAIClient extends GeneratedClient {
    private readonly _wrappers: ClientMetadataEntry[] = [];

    constructor(options: GeneratedClient.Options = {}) {
        const metadataHeaders = buildMetadataHeaders();
        super({
            ...options,
            headers: mergeHeaders(metadataHeaders, options.headers),
        });
    }

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

    /**
     * Register a wrapper library's metadata so it is included in subsequent
     * requests via the `X-VoyageAI-Wrapper` header. Duplicate entries (same
     * name + version) are silently ignored.
     *
     * @param entry - The wrapper name and version to register.
     *
     * @example
     *     client.appendClientMetadata({ name: "mem0", version: "1.2.3" });
     */
    public appendClientMetadata(entry: ClientMetadataEntry): void {
        const exists = this._wrappers.some((w) => w.name === entry.name && w.version === entry.version);
        if (!exists) {
            this._wrappers.push(entry);
            const wrapperValue = formatWrapperHeader(this._wrappers);
            if (wrapperValue != null) {
                (this._options as any).headers = mergeHeaders(
                    (this._options as any).headers,
                    { "X-VoyageAI-Wrapper": wrapperValue },
                );
            }
        }
    }
}
