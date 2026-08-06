/**
 * Endpoint resolution algorithm (spec §7): T1 override, T2 ProductId discovery,
 * skipping of unknown/absent ProductIds, ambiguity, auth-error propagation, and caching.
 * Uses a fake discovery so there is no AWS dependency or network.
 */

import type { SageMakerConfig } from "../../src/sagemaker/config";
import { SageMakerAuthError, SageMakerResolutionError } from "../../src/sagemaker/errors";
import { normalizeName, type SageMakerDiscovery, SageMakerEndpointResolver } from "../../src/sagemaker/resolver";

function config(endpointMap: Record<string, string> = {}): SageMakerConfig {
    return { region: "us-east-1", endpointMap, credentials: { type: "default" } };
}

// Fake product map keyed off the same shape as the real one: ProductId -> model name.
const PRODUCT_MAP: Readonly<Record<string, string>> = {
    "prod-lite": "voyage-4-lite",
    "prod-mm35": "voyage-multimodal-3.5",
    "prod-ctx4": "voyage-context-4",
    "prod-rr25": "rerank-2.5",
};

interface FakeEndpoint {
    name: string;
    productId?: string;
}

class FakeDiscovery implements SageMakerDiscovery {
    public listCalls = 0;
    constructor(private readonly endpoints: FakeEndpoint[]) {}

    async listInServiceEndpointNames(): Promise<string[]> {
        this.listCalls += 1;
        return this.endpoints.map((e) => e.name);
    }
    async getEndpointProductId(name: string): Promise<string | undefined> {
        return this.endpoints.find((e) => e.name === name)?.productId;
    }
}

function resolver(discovery: SageMakerDiscovery, endpointMap: Record<string, string> = {}): SageMakerEndpointResolver {
    return new SageMakerEndpointResolver(config(endpointMap), discovery, PRODUCT_MAP);
}

describe("normalizeName", () => {
    test("lowercases and dots to dashes", () => {
        expect(normalizeName("Voyage.3.Large")).toBe("voyage-3-large");
    });
});

describe("SageMakerEndpointResolver", () => {
    test("T1 explicit map override wins, no AWS call", async () => {
        const discovery = new FakeDiscovery([]);
        const r = resolver(discovery, { "voyage-4-lite": "my-ep" });
        expect(await r.resolve("voyage-4-lite")).toBe("my-ep");
        expect(discovery.listCalls).toBe(0);
    });

    test("single discovery candidate by ProductId", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", productId: "prod-lite" },
            { name: "ep-b", productId: "prod-rr25" },
        ]);
        expect(await resolver(discovery).resolve("voyage-4-lite")).toBe("ep-a");
    });

    test("dot-normalized model matches the mapped name", async () => {
        const discovery = new FakeDiscovery([{ name: "mm-ep", productId: "prod-mm35" }]);
        // Request uses the dotted public name; the map value is also dotted — both normalize.
        expect(await resolver(discovery).resolve("voyage-multimodal-3.5")).toBe("mm-ep");
    });

    test("unknown ProductId is skipped (not a public listing)", async () => {
        // e.g. the internal voyage-multimodal-3 package: has a ProductId, but not in the map.
        const discovery = new FakeDiscovery([{ name: "mm3-ep", productId: "prod-internal-mm3" }]);
        await expect(resolver(discovery).resolve("voyage-multimodal-3")).rejects.toBeInstanceOf(
            SageMakerResolutionError,
        );
    });

    test("absent ProductId is skipped (self-built package)", async () => {
        const discovery = new FakeDiscovery([{ name: "self-ep", productId: undefined }]);
        await expect(resolver(discovery).resolve("voyage-4-lite")).rejects.toThrow(/No SageMaker endpoint found/);
    });

    test("no candidate throws resolution error", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", productId: "prod-rr25" }]);
        await expect(resolver(discovery).resolve("voyage-4-lite")).rejects.toThrow(/No SageMaker endpoint found/);
    });

    test("multiple endpoints for one model throw an ambiguity error", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", productId: "prod-lite" },
            { name: "ep-b", productId: "prod-lite" },
        ]);
        const r = resolver(discovery);
        await expect(r.resolve("voyage-4-lite")).rejects.toBeInstanceOf(SageMakerResolutionError);
        await expect(r.resolve("voyage-4-lite")).rejects.toThrow(/Multiple SageMaker endpoints/);
    });

    test("AccessDenied on the describe chain propagates as SageMakerAuthError", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", productId: "prod-lite" }]);
        discovery.getEndpointProductId = async (): Promise<string | undefined> => {
            throw new SageMakerAuthError("denied DescribeModelPackage");
        };
        // Auth errors propagate unchanged (the client decides on API fallback vs surfacing).
        await expect(resolver(discovery).resolve("voyage-4-lite")).rejects.toBeInstanceOf(SageMakerAuthError);
    });

    test("result is cached; discovery runs once", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", productId: "prod-lite" }]);
        const r = resolver(discovery);
        expect(await r.resolve("voyage-4-lite")).toBe("ep-a");
        expect(await r.resolve("voyage-4-lite")).toBe("ep-a");
        expect(discovery.listCalls).toBe(1);
    });

    test("concurrent resolves are deduped", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", productId: "prod-lite" }]);
        const r = resolver(discovery);
        const [a, b] = await Promise.all([r.resolve("voyage-4-lite"), r.resolve("voyage-4-lite")]);
        expect(a).toBe("ep-a");
        expect(b).toBe("ep-a");
        expect(discovery.listCalls).toBe(1);
    });
});
