// Re-export everything from generated SDK
export * from "../api";
export * from "../errors";

// Export our extended client as the main one
export { VoyageAIClient } from "./ExtendedClient";

// For advanced users who want the original generated client
export { VoyageAIClient as GeneratedVoyageAIClient } from "../Client";

// Export local utilities for advanced use cases
export { localEmbed, isLocalModel } from "../local";
export type { TokenizeResult } from "../local/tokenizer";

// Export client metadata types for wrapping libraries
export type { ClientMetadataEntry } from "./client-metadata";
