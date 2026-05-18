import { describe, expect, it, vi } from "vitest";
import {
    detectRuntime,
    detectOS,
    buildMetadataHeaders,
    formatWrapperHeader,
    type ClientMetadataEntry,
} from "../../src/extended/client-metadata";

describe("detectRuntime", () => {
    it("returns a runtime name and version", () => {
        const result = detectRuntime();
        expect(result.name).toBe("Node.js");
        expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe("detectOS", () => {
    it("returns a known OS name", () => {
        const os = detectOS();
        expect(["Linux", "Darwin", "Windows"]).toContain(os);
    });
});

describe("buildMetadataHeaders", () => {
    it("returns all required X-VoyageAI-* headers", () => {
        const headers = buildMetadataHeaders();
        expect(headers["X-VoyageAI-Lang"]).toBe("typescript");
        expect(headers["X-VoyageAI-Package"]).toBe("voyageai");
        expect(headers["X-VoyageAI-Package-Version"]).toMatch(/^\d+\.\d+\.\d+$/);
        expect(headers["X-VoyageAI-Runtime"]).toBe("Node.js");
        expect(headers["X-VoyageAI-Runtime-Version"]).toMatch(/^\d+\.\d+\.\d+$/);
        expect(headers["X-VoyageAI-OS"]).toMatch(/^(Linux|Darwin|Windows)$/);
        expect(headers["X-VoyageAI-Telemetry-Version"]).toBe("1");
    });

    it("sets augmented User-Agent", () => {
        const headers = buildMetadataHeaders();
        const ua = headers["User-Agent"] as string;
        expect(ua).toMatch(/^voyageai-typescript\/\d+\.\d+\.\d+ Node\.js\/\d+\.\d+\.\d+ \w+$/);
    });

    it("does not include X-VoyageAI-Wrapper when no wrappers exist", () => {
        const headers = buildMetadataHeaders();
        expect(headers).not.toHaveProperty("X-VoyageAI-Wrapper");
    });
});

vi.mock("os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("os")>();
    return {
        ...actual,
        platform: vi.fn(actual.platform),
    };
});

describe("buildMetadataHeaders fail-open", () => {
    it("still returns headers if os.platform() throws", async () => {
        const osModule = await import("os");
        const platformMock = vi.mocked(osModule.platform);
        platformMock.mockImplementation(() => {
            throw new Error("OS detection failed");
        });
        try {
            const { buildMetadataHeaders: buildFresh } = await import("../../src/extended/client-metadata");
            const headers = buildFresh();
            expect(headers["X-VoyageAI-Lang"]).toBe("typescript");
            expect(headers["X-VoyageAI-OS"]).toBe("unknown");
        } finally {
            platformMock.mockRestore();
        }
    });
});

describe("formatWrapperHeader", () => {
    it("returns null for empty wrappers", () => {
        expect(formatWrapperHeader([])).toBeNull();
    });

    it("formats a single wrapper", () => {
        const wrappers: ClientMetadataEntry[] = [{ name: "mem0", version: "1.2.3" }];
        expect(formatWrapperHeader(wrappers)).toBe("mem0/1.2.3");
    });

    it("formats multiple wrappers with pipe delimiter", () => {
        const wrappers: ClientMetadataEntry[] = [
            { name: "mem0", version: "1.2.3" },
            { name: "llamaindex", version: "0.10.5" },
        ];
        expect(formatWrapperHeader(wrappers)).toBe("mem0/1.2.3|llamaindex/0.10.5");
    });
});
