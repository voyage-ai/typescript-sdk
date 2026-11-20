import { describe, expect, it, vi } from "vitest";
import {
    buildMetadataHeaders,
    formatWrapperHeader,
    validateClientMetadataEntry,
    type ClientMetadataEntry,
} from "../../src/extended/client-metadata";

describe("buildMetadataHeaders", () => {
    it("returns only User-Agent as voyageai-typescript/<version>", () => {
        const headers = buildMetadataHeaders();
        expect(Object.keys(headers)).toEqual(["User-Agent"]);
        expect(headers["User-Agent"]).toMatch(/^voyageai-typescript\/\d+\.\d+\.\d+$/);
    });

    it("reports unknown version when SDK_VERSION is empty", async () => {
        vi.resetModules();
        vi.doMock("../../src/version.js", () => ({ SDK_VERSION: "" }));
        try {
            const { buildMetadataHeaders: buildFresh } = await import("../../src/extended/client-metadata");
            expect(buildFresh()["User-Agent"]).toBe("voyageai-typescript/unknown");
        } finally {
            vi.doUnmock("../../src/version.js");
            vi.resetModules();
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
