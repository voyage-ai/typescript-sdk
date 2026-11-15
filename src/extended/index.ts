// Re-export everything from generated SDK
export * from "../api/index.js";
export * as VoyageAI from "../api/index.js";
export type { BaseClientOptions, BaseRequestOptions } from "../BaseClient.js";
// For advanced users who want the original generated client
export { VoyageAIClient as GeneratedVoyageAIClient } from "../Client.js";
export { VoyageAIEnvironment } from "../environments.js";
export * from "../errors/index.js";
export * from "../exports.js";
// Export local utilities for advanced use cases
export { isLocalModel, localEmbed } from "../local/index.js";
export type { TokenizeResult } from "../local/tokenizer.js";
export * as serialization from "../serialization/index.js";
// Export client metadata types for wrapping libraries
export type { ClientMetadataEntry } from "./client-metadata.js";
export type {
    ChunkFn,
    ContextualizedEmbeddingsResultItem,
    ContextualizedEmbedOptions,
    ContextualizedEmbedResult,
} from "./ExtendedClient.js";
// Export our extended client as the main one
export {
    applyChunking,
    buildContextualizedResult,
    defaultChunkFn,
    VoyageAIClient,
    validateAndNormalizeContextualizedInputs,
} from "./ExtendedClient.js";
