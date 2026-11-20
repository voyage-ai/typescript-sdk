import { mergeHeaders } from "../core/headers.js";
import { SDK_VERSION } from "../version.js";

export interface ClientMetadataEntry {
    name: string;
    version: string;
}

/** Headers sent with every request: only the SDK identity in `User-Agent`. */
export function buildMetadataHeaders(): Record<string, string> {
    return { "User-Agent": `voyageai-typescript/${SDK_VERSION || "unknown"}` };
}

export const MODEL_HEADER = "X-Voyage-Model";

/**
 * Return request options carrying the mandatory `X-Voyage-Model` header.
 * The header always mirrors the request body's `model`, so it overrides any caller-supplied value.
 * @throws Error if `model` is not a non-empty string.
 */
export function withModelHeader<T extends { headers?: Record<string, unknown> }>(model: string, requestOptions?: T): T {
    if (typeof model !== "string" || model.trim().length === 0) {
        throw new Error("model is required and must be a non-empty string.");
    }
    return {
        ...requestOptions,
        headers: mergeHeaders(requestOptions?.headers, { [MODEL_HEADER]: model }),
    } as T;
}

export function formatWrapperHeader(wrappers: ClientMetadataEntry[]): string | null {
    if (wrappers.length === 0) return null;
    return wrappers.map((w) => `${w.name}/${w.version}`).join("|");
}

// Only printable ASCII is allowed; "|" and "/" are the delimiters of the X-Voyage-Wrapper header.
// Checked on the raw value, so both SDKs accept exactly the same inputs.
const INVALID_WRAPPER_CHARS = /[^\x20-\x7e]|[|/]/;

function validateWrapperField(field: "name" | "version", value: unknown): string {
    if (typeof value !== "string") {
        throw new Error(`Wrapper ${field} must be a string, got ${typeof value}.`);
    }
    if (INVALID_WRAPPER_CHARS.test(value)) {
        throw new Error(
            `Wrapper ${field} ${JSON.stringify(value)} contains invalid characters ` +
                "(only printable ASCII is allowed, and '|' / '/' are reserved).",
        );
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new Error(`Wrapper ${field} must be a non-empty string.`);
    }
    return trimmed;
}

/** Validate a wrapper entry and return it with trimmed name and version. Throws on invalid input. */
export function validateClientMetadataEntry(entry: ClientMetadataEntry): ClientMetadataEntry {
    return {
        name: validateWrapperField("name", entry?.name),
        version: validateWrapperField("version", entry?.version),
    };
}
