/**
 * Type-safe model definitions for VoyageAI SDK
 * This file provides strongly-typed model names to enhance developer experience
 * and prevent runtime errors from invalid model names.
 */

import * as VoyageAI from "./api/index";

// Embedding Models
export type EmbedModel = 
  // Latest generation models (recommended)
  | "voyage-3-large"        // 32K context, best general-purpose and multilingual quality
  | "voyage-3.5"            // 32K context, optimized general-purpose and multilingual
  | "voyage-3.5-lite"       // 32K context, optimized for latency and cost
  | "voyage-3"              // 32K context, general-purpose and multilingual
  | "voyage-3-lite"         // 32K context, optimized for latency and cost
  | "voyage-code-3"         // 32K context, optimized for code retrieval
  
  // Second generation models
  | "voyage-finance-2"      // 32K context, optimized for finance
  | "voyage-law-2"          // 16K context, optimized for legal
  | "voyage-code-2"         // 16K context, optimized for code (previous gen)
  | "voyage-multilingual-2" // 32K context, optimized for multilingual
  | "voyage-large-2-instruct" // 16K context, instruction-tuned (deprecated)
  | "voyage-large-2"        // 16K context, general-purpose (deprecated)
  | "voyage-2"              // 4K context, balanced cost/latency/quality (deprecated)
  
  // First generation models (deprecated)
  | "voyage-lite-02-instruct" // 4K context, instruction-tuned (deprecated)
  | "voyage-02"             // 4K context, pilot v2 (deprecated)
  | "voyage-01"             // 4K context, v1 (deprecated)
  | "voyage-lite-01"        // 4K context, v1 lite (deprecated)
  | "voyage-lite-01-instruct"; // 4K context, v1 instruction-tuned (deprecated)

// Reranking Models
export type RerankModel = 
  // Latest generation models (preview)
  | "rerank-2.5"            // 32K context, generalist optimized for quality
  | "rerank-2.5-lite"       // 32K context, optimized for latency and quality
  
  // Second generation models
  | "rerank-2"              // 16K context, generalist optimized for quality
  | "rerank-2-lite"         // 8K context, optimized for latency and quality
  
  // First generation models
  | "rerank-1"              // 8K context, generalist optimized for quality
  | "rerank-lite-1";        // 4K context, optimized for latency and quality

// Multimodal Embedding Models
export type MultimodalEmbedModel = 
  | "voyage-multimodal-3";  // 32K context, rich multimodal embeddings

// Contextualized Embedding Models  
export type ContextualizedEmbedModel = 
  | "voyage-context-3";     // 32K context, contextualized chunk embeddings

// Type-safe request interfaces that extend the generated ones
export interface TypedEmbedRequest extends Omit<VoyageAI.EmbedRequest, 'model'> {
  model: EmbedModel;
}

export interface TypedRerankRequest extends Omit<VoyageAI.RerankRequest, 'model'> {
  model: RerankModel;
}

export interface TypedMultimodalEmbedRequest extends Omit<VoyageAI.MultimodalEmbedRequest, 'model'> {
  model: MultimodalEmbedModel;
}

export interface TypedContextualizedEmbedRequest extends Omit<VoyageAI.ContextualizedEmbedRequest, 'model'> {
  model: ContextualizedEmbedModel;
}

// Helper type for all possible models across all endpoints
export type AnyVoyageModel = EmbedModel | RerankModel | MultimodalEmbedModel | ContextualizedEmbedModel;

// Model categorization helpers
export const RECOMMENDED_EMBED_MODELS: EmbedModel[] = [
  "voyage-3-large",
  "voyage-3.5", 
  "voyage-3.5-lite",
  "voyage-3",
  "voyage-3-lite",
  "voyage-code-3"
];

export const RECOMMENDED_RERANK_MODELS: RerankModel[] = [
  "rerank-2.5",
  "rerank-2.5-lite",
  "rerank-2",
  "rerank-2-lite"
];

// Deprecated models that should be migrated
export const DEPRECATED_EMBED_MODELS: EmbedModel[] = [
  "voyage-large-2-instruct",
  "voyage-large-2", 
  "voyage-2",
  "voyage-lite-02-instruct",
  "voyage-02",
  "voyage-01",
  "voyage-lite-01",
  "voyage-lite-01-instruct"
];