import { describe, expect, it, vi } from "vitest";
import {
    detectRuntime,
    detectOS,
    buildMetadataHeaders,
    formatWrapperHeader,
    validateClientMetadataEntry,
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

describe("detectOS mapping", () => {
    it.each([
        ["darwin", "Darwin"],
        ["linux", "Linux"],
        ["win32", "Windows"],
        ["freebsd", "FreeBSD"],
        ["openbsd", "OpenBSD"],
        ["netbsd", "NetBSD"],
        ["sunos", "SunOS"],
        ["aix", "AIX"],
        ["android", "Android"],
        ["haiku", "haiku"],
    ])("maps %s to %s", async (platform, expected) => {
        const osModule = await import("os");
        const platformMock = vi.mocked(osModule.platform);
        platformMock.mockReturnValue(platform as NodeJS.Platform);
        try {
            expect(detectOS()).toBe(expected);
        } finally {
            platformMock.mockRestore();
        }
    });
});

describe("unknown fallbacks", () => {
    it("reports unknown runtime and runtime version when no runtime is detected", () => {
        const original = Object.getOwnPropertyDescriptor(process, "versions")!;
        Object.defineProperty(process, "versions", { value: {}, configurable: true });
        try {
            expect(detectRuntime()).toEqual({ name: "unknown", version: "unknown" });
            const headers = buildMetadataHeaders();
            expect(headers["X-VoyageAI-Runtime"]).toBe("unknown");
            expect(headers["X-VoyageAI-Runtime-Version"]).toBe("unknown");
            expect(headers["User-Agent"]).toMatch(/^voyageai-typescript\/\S+ unknown\/unknown \S+$/);
        } finally {
            Object.defineProperty(process, "versions", original);
        }
    });

    it("reports unknown package version when SDK_VERSION is empty", async () => {
        vi.resetModules();
        vi.doMock("../../src/version.js", () => ({ SDK_VERSION: "" }));
        try {
            const { buildMetadataHeaders: buildFresh } = await import("../../src/extended/client-metadata");
            const headers = buildFresh();
            expect(headers["X-VoyageAI-Package-Version"]).toBe("unknown");
            expect(headers["User-Agent"]).toMatch(/^voyageai-typescript\/unknown /);
        } finally {
            vi.doUnmock("../../src/version.js");
            vi.resetModules();
        }
    });
});

describe("User-Agent format", () => {
    it("is voyageai-typescript/<Package-Version> <Runtime>/<Runtime-Version> <OS>", () => {
        const headers = buildMetadataHeaders();
        expect(headers["User-Agent"]).toBe(
            `voyageai-typescript/${headers["X-VoyageAI-Package-Version"]} ` +
                `${headers["X-VoyageAI-Runtime"]}/${headers["X-VoyageAI-Runtime-Version"]} ${headers["X-VoyageAI-OS"]}`,
        );
    });
});

describe("validateClientMetadataEntry", () => {
    it("trims surrounding spaces from name and version", () => {
        expect(validateClientMetadataEntry({ name: "  mem0  ", version: " 1.2.3" })).toEqual({
            name: "mem0",
            version: "1.2.3",
        });
    });

    it.each([
        ["number", 123, "number"],
        ["undefined", undefined, "undefined"],
        ["null", null, "object"],
    ])("rejects a %s name", (_label, name, type) => {
        expect(() => validateClientMetadataEntry({ name: name as unknown as string, version: "1.0" })).toThrow(
            `Wrapper name must be a string, got ${type}.`,
        );
    });

    it.each([[""], ["   "]])("rejects %j as empty", (value) => {
        expect(() => validateClientMetadataEntry({ name: value, version: "1.0" })).toThrow(
            "Wrapper name must be a non-empty string.",
        );
        expect(() => validateClientMetadataEntry({ name: "mem0", version: value })).toThrow(
            "Wrapper version must be a non-empty string.",
        );
    });

    it.each([
        ["a|b"],
        ["a/b"],
        ["a\nb"],
        ["a\n"],
        ["\x7f"],
        ["a\x00b"],
        ["a\x1f"],
        ["\tmem0"],
        [" a\t"],
        ["mem0\u00e9"],
        ["a\u00a0b"],
        ["a\x85"],
    ])("rejects %j as invalid characters", (value) => {
        expect(() => validateClientMetadataEntry({ name: value, version: "1.0" })).toThrow(
            /^Wrapper name .* contains invalid characters \(only printable ASCII is allowed, and '\|' \/ '\/' are reserved\)\.$/,
        );
        expect(() => validateClientMetadataEntry({ name: "mem0", version: value })).toThrow(
            /^Wrapper version .* contains invalid characters/,
        );
    });
});
