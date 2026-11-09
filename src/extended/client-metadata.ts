import * as os from "os";
import { SDK_VERSION } from "../version.js";

export interface RuntimeInfo {
    name: string;
    version: string;
}

export interface ClientMetadataEntry {
    name: string;
    version: string;
}

declare const Deno: { version: { deno: string } } | undefined;
declare const Bun: { version: string } | undefined;

export function detectRuntime(): RuntimeInfo {
    try {
        if (typeof Deno !== "undefined" && Deno?.version?.deno) {
            return { name: "Deno", version: Deno.version.deno };
        }
        if (typeof Bun !== "undefined" && Bun?.version) {
            return { name: "Bun", version: Bun.version };
        }
        if (typeof process !== "undefined" && process.versions?.node) {
            return { name: "Node.js", version: process.versions.node };
        }
    } catch {}
    return { name: "unknown", version: "unknown" };
}

// Canonical OS names follow Python's platform.system() so both SDKs report the same values.
const OS_NAMES: Record<string, string> = {
    darwin: "Darwin",
    linux: "Linux",
    win32: "Windows",
    freebsd: "FreeBSD",
    openbsd: "OpenBSD",
    netbsd: "NetBSD",
    sunos: "SunOS",
    aix: "AIX",
    android: "Android",
};

export function detectOS(): string {
    try {
        const platform = os.platform();
        if (platform) return OS_NAMES[platform] ?? platform;
    } catch {}
    return "unknown";
}

export function buildMetadataHeaders(): Record<string, string> {
    const runtime = detectRuntime();
    const osName = detectOS();
    const packageVersion = SDK_VERSION || "unknown";

    const headers: Record<string, string> = {
        "X-VoyageAI-Lang": "typescript",
        "X-VoyageAI-Package": "voyageai",
        "X-VoyageAI-Package-Version": packageVersion,
        "X-VoyageAI-Runtime": runtime.name,
        "X-VoyageAI-Runtime-Version": runtime.version,
        "X-VoyageAI-OS": osName,
        "X-VoyageAI-Telemetry-Version": "1",
        "User-Agent": `voyageai-typescript/${packageVersion} ${runtime.name}/${runtime.version} ${osName}`,
    };

    return headers;
}

export function formatWrapperHeader(wrappers: ClientMetadataEntry[]): string | null {
    if (wrappers.length === 0) return null;
    return wrappers.map((w) => `${w.name}/${w.version}`).join("|");
}

// Only printable ASCII is allowed; "|" and "/" are the delimiters of the X-VoyageAI-Wrapper header.
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
