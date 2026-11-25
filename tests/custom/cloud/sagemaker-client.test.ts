/**
 * SageMakerVoyageAIClient: splitting provider settings from the regular client options at
 * construction, eager validation, and the VoyageAIClient surface it inherits. AWS deps and HTTP are
 * injected — no real AWS, no network.
 */

import { describe, expect, test, vi } from "vitest";
import type { AwsDeps } from "../../../src/cloud/aws/awsDeps";
import { type SageMakerClientOptions, SageMakerVoyageAIClient } from "../../../src/cloud/aws/client";
import { SageMakerProvider, sagemakerProvider } from "../../../src/cloud/aws/provider";
import { VoyageAIClient } from "../../../src/extended/index";

const EMBED_BODY = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
    model: "voyage-3",
    usage: { total_tokens: 3 },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Deps whose account has one endpoint, `ep-a`, tagged `voyageai:model=voyage-3`. */
function signingDeps(): AwsDeps {
    return {
        createSigner: () => ({
            async sign({ headers }) {
                return { ...headers, authorization: "AWS4-HMAC..." };
            },
        }),
        createDiscovery: () => ({
            async listInServiceEndpointNames() {
                return ["ep-a"];
            },
            async getEndpointProductId() {
                return undefined;
            },
            async getEndpointModelTag() {
                return "voyage-3";
            },
        }),
    };
}

describe("SageMakerVoyageAIClient", () => {
    test("splits provider options from the stock client options", async () => {
        const fetchMock = vi.fn(async () => jsonResponse(EMBED_BODY));
        const client = new SageMakerVoyageAIClient(
            {
                region: "eu-west-1",
                awsAccessKeyId: "AKIA",
                awsSecretAccessKey: "secret",
                apiKey: "key",
                headers: { "X-Client": "c" },
                timeoutInSeconds: 5,
                maxRetries: 0,
                fetch: fetchMock as unknown as typeof fetch,
            },
            { depsLoader: async () => signingDeps() },
        );

        const provider = client.provider;
        expect(provider).toBeInstanceOf(SageMakerProvider);
        expect((provider as SageMakerProvider).config).toMatchObject({
            region: "eu-west-1",
            credentials: { type: "static", accessKeyId: "AKIA", secretAccessKey: "secret" },
        });

        const result = await client.embed({ model: "voyage-3", input: "hi" });
        expect(result.data?.[0]?.embedding).toEqual([0.1, 0.2]);

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(String(url)).toBe("https://runtime.sagemaker.eu-west-1.amazonaws.com/endpoints/ep-a/invocations");
        expect(new Headers(init.headers).get("x-client")).toBe("c");
        expect(new Headers(init.headers).get("authorization")).toBe("AWS4-HMAC...");
    });

    test("a profile reaches the credential source", () => {
        const client = new SageMakerVoyageAIClient({ region: "us-east-1", profileName: "dev" });
        expect((client.provider as SageMakerProvider).config.credentials).toEqual({
            type: "profile",
            profileName: "dev",
        });
    });

    test("validates the provider options eagerly", () => {
        expect(() => new SageMakerVoyageAIClient({ region: "us-east-1", awsAccessKeyId: "only-the-id" })).toThrow(
            /must be provided together/,
        );
        expect(() => new SageMakerVoyageAIClient({})).toThrow(/requires a region/);
    });

    test("is a VoyageAIClient, and its provider cannot be replaced", () => {
        const client: VoyageAIClient = new SageMakerVoyageAIClient({ region: "us-east-1" });
        expect(client).toBeInstanceOf(VoyageAIClient);
        expect(typeof client.appendClientMetadata).toBe("function");
        expect(client.provider?.name).toBe("aws");

        // The provider is fixed by the class; VoyageAIClient is the entry point for injecting one.
        const provider = sagemakerProvider({ region: "us-east-1" });
        // @ts-expect-error -- `provider` is not a SageMakerVoyageAIClient option.
        const options: SageMakerClientOptions = { region: "us-east-1", provider };
        expect(options.region).toBe("us-east-1");
    });
});
