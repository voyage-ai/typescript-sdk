/**
 * Type-safe wrapper for VoyageAIClient
 * Provides strongly-typed model names while maintaining full backward compatibility
 */

import { VoyageAIClient } from "./Client";
import * as VoyageAI from "./api/index";
import {
  TypedEmbedRequest,
  TypedRerankRequest, 
  TypedMultimodalEmbedRequest,
  TypedContextualizedEmbedRequest
} from "./models";

export class TypedVoyageAIClient extends VoyageAIClient {
  /**
   * Type-safe embed method with strongly-typed model names
   * @param request - Embed request with type-safe model field
   * @param requestOptions - Request-specific configuration
   * @returns Promise<VoyageAI.EmbedResponse>
   * 
   * @example
   * ```typescript
   * await client.embed({
   *   input: "Hello world",
   *   model: "voyage-3-large" // TypeScript will autocomplete and validate this
   * });
   * ```
   */
  public async embed(
    request: TypedEmbedRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.EmbedResponse> {
    return super.embed(request, requestOptions);
  }

  /**
   * Type-safe rerank method with strongly-typed model names
   * @param request - Rerank request with type-safe model field  
   * @param requestOptions - Request-specific configuration
   * @returns Promise<VoyageAI.RerankResponse>
   * 
   * @example
   * ```typescript
   * await client.rerank({
   *   query: "search query",
   *   documents: ["doc1", "doc2"],
   *   model: "rerank-2.5" // TypeScript will autocomplete and validate this
   * });
   * ```
   */
  public async rerank(
    request: TypedRerankRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.RerankResponse> {
    return super.rerank(request, requestOptions);
  }

  /**
   * Type-safe multimodal embed method with strongly-typed model names
   * @param request - Multimodal embed request with type-safe model field
   * @param requestOptions - Request-specific configuration  
   * @returns Promise<VoyageAI.MultimodalEmbedResponse>
   * 
   * @example
   * ```typescript
   * await client.multimodalEmbed({
   *   inputs: [{ content: [{ type: "text", text: "Hello" }] }],
   *   model: "voyage-multimodal-3" // TypeScript will autocomplete and validate this
   * });
   * ```
   */
  public async multimodalEmbed(
    request: TypedMultimodalEmbedRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.MultimodalEmbedResponse> {
    return super.multimodalEmbed(request, requestOptions);
  }

  /**
   * Type-safe contextualized embed method with strongly-typed model names
   * @param request - Contextualized embed request with type-safe model field
   * @param requestOptions - Request-specific configuration
   * @returns Promise<VoyageAI.ContextualizedEmbedResponse>
   * 
   * @example  
   * ```typescript
   * await client.contextualizedEmbed({
   *   inputs: [["chunk1", "chunk2"]],
   *   model: "voyage-context-3" // TypeScript will autocomplete and validate this
   * });
   * ```
   */
  public async contextualizedEmbed(
    request: TypedContextualizedEmbedRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.ContextualizedEmbedResponse> {
    return super.contextualizedEmbed(request, requestOptions);
  }

  // Legacy methods that accept string models (for backward compatibility)
  
  /**
   * Legacy embed method that accepts string model names (backward compatibility)
   * @deprecated Use the typed embed method for better type safety
   */
  public async embedLegacy(
    request: VoyageAI.EmbedRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.EmbedResponse> {
    return super.embed(request, requestOptions);
  }

  /**
   * Legacy rerank method that accepts string model names (backward compatibility)
   * @deprecated Use the typed rerank method for better type safety
   */
  public async rerankLegacy(
    request: VoyageAI.RerankRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.RerankResponse> {
    return super.rerank(request, requestOptions);
  }

  /**
   * Legacy multimodal embed method that accepts string model names (backward compatibility)
   * @deprecated Use the typed multimodalEmbed method for better type safety
   */
  public async multimodalEmbedLegacy(
    request: VoyageAI.MultimodalEmbedRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.MultimodalEmbedResponse> {
    return super.multimodalEmbed(request, requestOptions);
  }

  /**
   * Legacy contextualized embed method that accepts string model names (backward compatibility)
   * @deprecated Use the typed contextualizedEmbed method for better type safety
   */
  public async contextualizedEmbedLegacy(
    request: VoyageAI.ContextualizedEmbedRequest,
    requestOptions?: VoyageAIClient.RequestOptions
  ): Promise<VoyageAI.ContextualizedEmbedResponse> {
    return super.contextualizedEmbed(request, requestOptions);
  }
}