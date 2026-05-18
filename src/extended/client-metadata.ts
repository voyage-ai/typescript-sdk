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

export function detectOS(): string {
    try {
        const platform = os.platform();
        if (platform === "darwin") return "Darwin";
        if (platform === "win32") return "Windows";
        if (platform === "linux") return "Linux";
        return platform;
    } catch {}
    return "unknown";
}

export function buildMetadataHeaders(): Record<string, string> {
    const runtime = detectRuntime();
    const osName = detectOS();

    const headers: Record<string, string> = {
        "X-VoyageAI-Lang": "typescript",
        "X-VoyageAI-Package": "voyageai",
        "X-VoyageAI-Package-Version": SDK_VERSION,
        "X-VoyageAI-Runtime": runtime.name,
        "X-VoyageAI-Runtime-Version": runtime.version,
        "X-VoyageAI-OS": osName,
        "X-VoyageAI-Telemetry-Version": "1",
        "User-Agent": `voyageai-typescript/${SDK_VERSION} ${runtime.name}/${runtime.version} ${osName}`,
    };

    return headers;
}

export function formatWrapperHeader(wrappers: ClientMetadataEntry[]): string | null {
    if (wrappers.length === 0) return null;
    return wrappers.map((w) => `${w.name}/${w.version}`).join("|");
}
