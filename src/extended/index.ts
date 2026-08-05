// Re-export everything from generated SDK
export * from "../api/index.js";
// For advanced users who want the original generated client
export { VoyageAIClient as GeneratedVoyageAIClient } from "../Client.js";
export * from "../errors/index.js";
// Export local utilities for advanced use cases
export { isLocalModel, localEmbed } from "../local/index.js";
export type { TokenizeResult } from "../local/tokenizer.js";
// AWS SageMaker public surface (types + errors; no separate client class)
export type { AwsSagemakerOptions, SageMakerConfig, SageMakerCredentialSource } from "../sagemaker/config.js";
export { SageMakerAuthError, SageMakerResolutionError } from "../sagemaker/errors.js";
export type {
    ChunkFn,
    ContextualizedEmbeddingsResultItem,
    ContextualizedEmbedOptions,
    ContextualizedEmbedResult,
    ExtendedClientOptions,
} from "./ExtendedClient.js";
// Export our extended client as the main one
export {
    applyChunking,
    buildContextualizedResult,
    defaultChunkFn,
    VoyageAIClient,
    validateAndNormalizeContextualizedInputs,
} from "./ExtendedClient.js";
