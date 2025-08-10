export * as VoyageAI from "./api";
export { VoyageAIClient } from "./Client";
export { VoyageAIEnvironment } from "./environments";
export { VoyageAIError, VoyageAITimeoutError } from "./errors";

export { TypedVoyageAIClient } from "./typed-client";
export {
  EmbedModel,
  RerankModel,
  MultimodalEmbedModel,
  ContextualizedEmbedModel,
  AnyVoyageModel,
  TypedEmbedRequest,
  TypedRerankRequest,
  TypedMultimodalEmbedRequest,
  TypedContextualizedEmbedRequest,
  RECOMMENDED_EMBED_MODELS,
  RECOMMENDED_RERANK_MODELS,
  DEPRECATED_EMBED_MODELS
} from "./models";
