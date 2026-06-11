// Re-export everything from generated SDK
export * from "../api/index.js";
export * from "../errors/index.js";

// Export our extended client as the main one
export {
    applyChunking,
    defaultChunkFn,
    VoyageAIClient,
    validateAndNormalizeContextualizedInputs,
} from "./ExtendedClient.js";
export type { ChunkFn, ContextualizedEmbedOptions } from "./ExtendedClient.js";

// For advanced users who want the original generated client
export { VoyageAIClient as GeneratedVoyageAIClient } from "../Client.js";

// Export local utilities for advanced use cases
export { isLocalModel, localEmbed } from "../local/index.js";
export type { TokenizeResult } from "../local/tokenizer.js";
