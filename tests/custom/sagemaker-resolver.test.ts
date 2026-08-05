/**
 * Endpoint resolution algorithm (spec §7): T1 override, T2 discovery, T3 convention,
 * disambiguation, caching, and the token-boundary predicate. Uses a fake discovery so
 * there is no AWS dependency or network.
 */

import type { SageMakerConfig } from "../../src/sagemaker/config";
import { SageMakerResolutionError } from "../../src/sagemaker/errors";
import {
    matchesAtTokenBoundary,
    normalizeName,
    type SageMakerDiscovery,
    SageMakerEndpointResolver,
} from "../../src/sagemaker/resolver";

function config(endpointMap: Record<string, string> = {}): SageMakerConfig {
    return { region: "us-east-1", endpointMap, credentials: { type: "default" } };
}

interface FakeEndpoint {
    name: string;
    arns?: string[];
    tag?: string;
}

class FakeDiscovery implements SageMakerDiscovery {
    public listCalls = 0;
    constructor(private readonly endpoints: FakeEndpoint[]) {}

    async listInServiceEndpointNames(): Promise<string[]> {
        this.listCalls += 1;
        return this.endpoints.map((e) => e.name);
    }
    async getEndpointModelPackageArns(name: string): Promise<string[]> {
        return this.endpoints.find((e) => e.name === name)?.arns ?? [];
    }
    async getEndpointModelTag(name: string): Promise<string | undefined> {
        return this.endpoints.find((e) => e.name === name)?.tag;
    }
}

const arn = (name: string): string => `arn:aws:sagemaker:us-east-1:123456789012:model-package/${name}`;

describe("matchesAtTokenBoundary", () => {
    test("matches at boundaries", () => {
        expect(matchesAtTokenBoundary("voyage-3-large-abc", "voyage-3-large")).toBe(true);
        expect(matchesAtTokenBoundary("prefix-voyage-3-v1", "voyage-3")).toBe(true);
    });
    test("rejects mid-token", () => {
        expect(matchesAtTokenBoundary("voyage-30-v1", "voyage-3")).toBe(false);
        expect(matchesAtTokenBoundary("voyage-3large", "voyage-3")).toBe(false);
    });
    test("empty model never matches", () => {
        expect(matchesAtTokenBoundary("anything", "")).toBe(false);
    });
});

describe("normalizeName", () => {
    test("lowercases and dots to dashes", () => {
        expect(normalizeName("Voyage.3.Large")).toBe("voyage-3-large");
    });
});

describe("SageMakerEndpointResolver", () => {
    test("T1 explicit map override wins, no AWS call", async () => {
        const discovery = new FakeDiscovery([]);
        const resolver = new SageMakerEndpointResolver(config({ "voyage-3": "my-ep" }), discovery);
        expect(await resolver.resolve("voyage-3")).toBe("my-ep");
        expect(discovery.listCalls).toBe(0);
    });

    test("T2 single discovery candidate", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", arns: [arn("voyage-3-large-1")] },
            { name: "ep-b", arns: [arn("something-else")] },
        ]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        expect(await resolver.resolve("voyage-3-large")).toBe("ep-a");
    });

    test("T2 ambiguous resolved by voyageai:model tag", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", arns: [arn("voyage-3")], tag: "voyage-3" },
            { name: "ep-b", arns: [arn("voyage-3")], tag: "other" },
        ]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        expect(await resolver.resolve("voyage-3")).toBe("ep-a");
    });

    test("T2 ambiguous resolved by endpoint name convention", async () => {
        const discovery = new FakeDiscovery([
            { name: "voyage-3", arns: [arn("voyage-3")] },
            { name: "ep-b", arns: [arn("voyage-3")] },
        ]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        expect(await resolver.resolve("voyage-3")).toBe("voyage-3");
    });

    test("ambiguous with no disambiguator throws", async () => {
        const discovery = new FakeDiscovery([
            { name: "ep-a", arns: [arn("voyage-3")] },
            { name: "ep-b", arns: [arn("voyage-3")] },
        ]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        await expect(resolver.resolve("voyage-3")).rejects.toBeInstanceOf(SageMakerResolutionError);
        await expect(resolver.resolve("voyage-3")).rejects.toThrow(/Multiple SageMaker endpoints/);
    });

    test("T3 convention fallback via tag when no ARN candidate", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", arns: [], tag: "voyage-3" }]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        expect(await resolver.resolve("voyage-3")).toBe("ep-a");
    });

    test("T3 convention fallback via endpoint name", async () => {
        const discovery = new FakeDiscovery([{ name: "voyage-3", arns: [] }]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        expect(await resolver.resolve("voyage-3")).toBe("voyage-3");
    });

    test("no candidate throws resolution error", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", arns: [arn("other-model")] }]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        await expect(resolver.resolve("voyage-3")).rejects.toThrow(/No SageMaker endpoint found/);
    });

    test("result is cached; discovery runs once", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", arns: [arn("voyage-3")] }]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        expect(await resolver.resolve("voyage-3")).toBe("ep-a");
        expect(await resolver.resolve("voyage-3")).toBe("ep-a");
        expect(discovery.listCalls).toBe(1);
    });

    test("concurrent resolves are deduped", async () => {
        const discovery = new FakeDiscovery([{ name: "ep-a", arns: [arn("voyage-3")] }]);
        const resolver = new SageMakerEndpointResolver(config(), discovery);
        const [a, b] = await Promise.all([resolver.resolve("voyage-3"), resolver.resolve("voyage-3")]);
        expect(a).toBe("ep-a");
        expect(b).toBe("ep-a");
        expect(discovery.listCalls).toBe(1);
    });
});
