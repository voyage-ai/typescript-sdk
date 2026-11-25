/**
 * Provider selection from `VOYAGE_CLOUD_PROVIDER` for clients constructed without a `provider`
 * option. No AWS calls are made.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { providerFromEnv } from "../../../src/cloud/env-provider";
import { type Provider, SageMakerProvider, VoyageAIClient } from "../../../src/extended/index";

afterEach(() => {
    vi.unstubAllEnvs();
});

function stubAws(region = "us-east-1"): void {
    vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
    vi.stubEnv("AWS_REGION", region);
}

describe("providerFromEnv", () => {
    test("unset, blank and 'voyage' mean the Voyage API", () => {
        expect(providerFromEnv({})).toBeUndefined();
        expect(providerFromEnv({ VOYAGE_CLOUD_PROVIDER: "  " })).toBeUndefined();
        expect(providerFromEnv({ VOYAGE_CLOUD_PROVIDER: "voyage" })).toBeUndefined();
    });

    test("'aws' builds the SageMaker provider from the standard AWS environment", () => {
        const provider = providerFromEnv({ VOYAGE_CLOUD_PROVIDER: "aws", AWS_DEFAULT_REGION: "eu-west-1" });
        expect(provider).toBeInstanceOf(SageMakerProvider);
        expect((provider as SageMakerProvider).config).toEqual({
            region: "eu-west-1",
            endpointMap: {},
            credentials: { type: "default" },
        });
    });

    test("'aws' without a region fails with the SageMaker configuration error", () => {
        expect(() => providerFromEnv({ VOYAGE_CLOUD_PROVIDER: "aws" })).toThrow(/requires a region/);
    });

    test("reserved and unknown values are rejected", () => {
        expect(() => providerFromEnv({ VOYAGE_CLOUD_PROVIDER: "gcp" })).toThrow(
            "VOYAGE_CLOUD_PROVIDER=gcp: the 'gcp' provider is reserved but not yet available in this version of voyageai.",
        );
        expect(() => providerFromEnv({ VOYAGE_CLOUD_PROVIDER: "sagemaker" })).toThrow(
            "VOYAGE_CLOUD_PROVIDER=sagemaker: unknown provider. Use one of: voyage, aws.",
        );
    });
});

describe("client provider selection", () => {
    test("without VOYAGE_CLOUD_PROVIDER a client uses the Voyage API", () => {
        expect(new VoyageAIClient({ apiKey: "key" }).provider).toBeUndefined();
    });

    test("VOYAGE_CLOUD_PROVIDER=aws routes new clients to SageMaker", () => {
        stubAws();
        expect(new VoyageAIClient().provider).toBeInstanceOf(SageMakerProvider);
    });

    test("clients built from the same environment share one provider (one discovery cache)", () => {
        stubAws();
        const first = new VoyageAIClient().provider;
        expect(new VoyageAIClient().provider).toBe(first);

        stubAws("us-west-2");
        const other = new VoyageAIClient().provider as SageMakerProvider;
        expect(other).not.toBe(first);
        expect(other.config.region).toBe("us-west-2");
    });

    test("a misconfigured environment fails at construction", () => {
        vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
        vi.stubEnv("AWS_REGION", "");
        vi.stubEnv("AWS_DEFAULT_REGION", "");
        expect(() => new VoyageAIClient()).toThrow(/requires a region/);
    });

    test("an explicit provider option wins over the environment", () => {
        stubAws();
        const explicit: Provider = { name: "explicit", resolve: async () => undefined };
        expect(new VoyageAIClient({ provider: explicit }).provider).toBe(explicit);
    });

    test("the environment is read at construction", () => {
        const before = new VoyageAIClient({ apiKey: "key" });
        stubAws();
        expect(before.provider).toBeUndefined();
        expect(new VoyageAIClient().provider).toBeInstanceOf(SageMakerProvider);
    });
});
