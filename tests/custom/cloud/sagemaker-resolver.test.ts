/**
 * Endpoint resolution algorithm: ProductId discovery,
 * skipping of unknown/absent ProductIds, tag/name tie-breaks, ambiguity, auth-error
 * propagation, and caching. Uses a fake discovery so there is no AWS dependency or network.
 */

import type { SageMakerConfig } from "../../../src/cloud/aws/config";
import { normalizeName, type SageMakerDiscovery, SageMakerEndpointResolver } from "../../../src/cloud/aws/resolver";
import { ProviderResolutionError } from "../../../src/cloud/providers";

const CONFIG: SageMakerConfig = { region: "us-east-1", credentials: { type: "default" } };

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
    modelTag?: string;
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
    async getEndpointModelTag(name: string): Promise<string | undefined> {
        return this.endpoints.find((e) => e.name === name)?.modelTag;
    }
}

function resolver(discovery: SageMakerDiscovery): SageMakerEndpointResolver {
    return new SageMakerEndpointResolver(CONFIG, discovery, PRODUCT_MAP);
}

describe("normalizeName", () => {
    test("lowercases and dots to dashes", () => {
        expect(normalizeName("Voyage.3.Large")).toBe("voyage-3-large");
    });
});

describe("SageMakerEndpointResolver", () => {
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
        const discovery = new FakeDiscovery([{ name: "mm3-ep", productId: "prod-internal-mm3" }]);
        await expect(resolver(discovery).resolve("voyage-multimodal-3")).rejects.toBeInstanceOf(
            ProviderResolutionError,
        );
    });

    test("absent ProductId is skipped (self-built package)", async () => {
        const discovery = new FakeDiscovery([{ name: "self-ep", productId: undefined }]);
        await expect(resolver(discovery).resolve("voyage-4-lite")).rejects.toThrow(/No SageMaker endpoint found/);
    });

    test("no candidate throws an invalid_request resolution error", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", productId: "prod-rr25" }]);
        const error = await resolver(discovery)
            .resolve("voyage-4-lite")
            .then(() => undefined)
            .catch((e) => e as ProviderResolutionError);
        expect(error).toBeInstanceOf(ProviderResolutionError);
        expect(error?.kind).toBe("invalid_request");
        expect(error?.message).toMatch(/No SageMaker endpoint found/);
        expect(error?.message).toContain("Tag the endpoint with voyageai:model=voyage-4-lite.");
    });

    test("multiple candidates without a tie-break throw an ambiguity error", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", productId: "prod-lite" },
            { name: "ep-b", productId: "prod-lite" },
        ]);
        const r = resolver(discovery);
        await expect(r.resolve("voyage-4-lite")).rejects.toBeInstanceOf(ProviderResolutionError);
        await expect(r.resolve("voyage-4-lite")).rejects.toThrow(/Multiple SageMaker endpoints/);
        await expect(r.resolve("voyage-4-lite")).rejects.toThrow(
            /Tag exactly one of them with voyageai:model=voyage-4-lite\./,
        );
    });

    test("tie-break 1: exactly one of multiple candidates carries the voyageai:model tag", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", productId: "prod-lite" },
            { name: "ep-b", productId: "prod-lite", modelTag: "voyage-4-lite" },
        ]);
        expect(await resolver(discovery).resolve("voyage-4-lite")).toBe("ep-b");
    });

    test("tie-break 2: exactly one candidate's name equals normalize(model)", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", productId: "prod-mm35" },
            { name: "voyage-multimodal-3-5", productId: "prod-mm35" },
        ]);
        expect(await resolver(discovery).resolve("voyage-multimodal-3.5")).toBe("voyage-multimodal-3-5");
    });

    test("zero candidates: the voyageai:model tag reaches an unidentifiable endpoint", async () => {
        // Internal listing (unknown ProductId), but the user tagged the endpoint.
        const discovery = new FakeDiscovery([
            { name: "mm3-ep", productId: "prod-internal-mm3", modelTag: "voyage-multimodal-3" },
            { name: "other-ep", productId: "prod-rr25" },
        ]);
        expect(await resolver(discovery).resolve("voyage-multimodal-3")).toBe("mm3-ep");
    });

    test("zero candidates: a conventionally named endpoint reaches a self-built package", async () => {
        const discovery = new FakeDiscovery([{ name: "voyage-4-lite", productId: undefined }]);
        expect(await resolver(discovery).resolve("voyage-4-lite")).toBe("voyage-4-lite");
    });

    test("zero candidates with two matching tags stays an error", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", modelTag: "voyage-4-lite" },
            { name: "ep-b", modelTag: "voyage-4-lite" },
        ]);
        await expect(resolver(discovery).resolve("voyage-4-lite")).rejects.toThrow(/No SageMaker endpoint found/);
    });

    test("AccessDenied on the describe chain propagates as an authentication resolution error", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", productId: "prod-lite" }]);
        discovery.getEndpointProductId = async (): Promise<string | undefined> => {
            throw new ProviderResolutionError("denied DescribeModelPackage", "authentication");
        };
        const error = await resolver(discovery)
            .resolve("voyage-4-lite")
            .then(() => undefined)
            .catch((e) => e as ProviderResolutionError);
        expect(error).toBeInstanceOf(ProviderResolutionError);
        expect(error?.kind).toBe("authentication");
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
