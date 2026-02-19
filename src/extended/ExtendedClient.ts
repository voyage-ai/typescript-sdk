/**
 * Extended VoyageAI client with local model support
 */

import { VoyageAIClient as GeneratedClient } from "../Client";
import type * as VoyageAI from "../api";
import { HttpResponsePromise } from "../core/fetcher/HttpResponsePromise";
import { unknownRawResponse } from "../core/fetcher/RawResponse";
import { localEmbed, isLocalModel } from "../local";

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
        requestOptions?: GeneratedClient.RequestOptions
    ): HttpResponsePromise<VoyageAI.EmbedResponse> {
        if (isLocalModel(request.model)) {
            return HttpResponsePromise.fromPromise(
                localEmbed(request).then((data) => ({ data, rawResponse: unknownRawResponse }))
            );
        }
        return super.embed(request, requestOptions);
    }
}
