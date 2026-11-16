/**
 * Default base URL selection by API key, matching the Python SDK's `get_default_base_url`.
 *
 * MongoDB Atlas API keys (prefix `al-`) are served from `https://ai.mongodb.com/v1`; every other
 * key uses the Voyage AI API.
 */

import type { BaseClientOptions } from "../BaseClient.js";
import * as core from "../core/index.js";

/** Base URL for Voyage AI API keys (the generated client's `VoyageAIEnvironment.Default`). */
export const VOYAGE_API_BASE_URL = "https://api.voyageai.com/v1";

/** Base URL for MongoDB Atlas API keys (`al-` prefix). */
export const MONGODB_ATLAS_BASE_URL = "https://ai.mongodb.com/v1";

const ATLAS_KEY_PREFIX = "al-";
const API_KEY_ENV_VAR = "VOYAGE_API_KEY";

export function getDefaultBaseUrl(apiKey: string): string {
    return apiKey.startsWith(ATLAS_KEY_PREFIX) ? MONGODB_ATLAS_BASE_URL : VOYAGE_API_BASE_URL;
}

/**
 * Pick the base URL from the API key unless the caller pinned `baseUrl` or `environment`.
 *
 * The key is resolved on every request the same way the generated auth provider does it (the
 * `apiKey` option first, then `VOYAGE_API_KEY`), so the URL and the bearer token always come from
 * the same key. Without a key the Voyage AI API URL is used, which is also the generated client's default.
 */
export function withDefaultBaseUrl<T extends BaseClientOptions & { apiKey?: core.Supplier<string> }>(options: T): T {
    if (options.baseUrl != null || options.environment != null) {
        return options;
    }
    return {
        ...options,
        baseUrl: async () => {
            const apiKey =
                (await core.Supplier.get(options.apiKey)) ??
                (typeof process !== "undefined" ? process.env?.[API_KEY_ENV_VAR] : undefined);
            return apiKey ? getDefaultBaseUrl(apiKey) : VOYAGE_API_BASE_URL;
        },
    };
}
