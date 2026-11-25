/**
 * Ambient provider configuration: `VOYAGE_CLOUD_PROVIDER`, `setDefaultProvider`, and how a client
 * constructed without a `provider` option picks between them. No AWS calls are made.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import {
    getDefaultProvider,
    type Provider,
    providerFromEnv,
    SageMakerProvider,
    setDefaultProvider,
    VoyageAIClient,
} from "../../../src/extended/index";

const fakeProvider = (name: string): Provider => ({ name, resolve: async () => undefined });

afterEach(() => {
    setDefaultProvider(undefined);
    vi.unstubAllEnvs();
});

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
    test("without any configuration a client uses the Voyage API", () => {
        expect(new VoyageAIClient({ apiKey: "key" }).provider).toBeUndefined();
    });

    test("VOYAGE_CLOUD_PROVIDER alone routes new clients to the provider", () => {
        vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
        vi.stubEnv("AWS_REGION", "us-east-1");
        expect(new VoyageAIClient().provider).toBeInstanceOf(SageMakerProvider);
    });

    test("clients built from the same environment share one provider (one discovery cache)", () => {
        vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
        vi.stubEnv("AWS_REGION", "us-east-1");
        const first = new VoyageAIClient().provider;
        expect(new VoyageAIClient().provider).toBe(first);

        vi.stubEnv("AWS_REGION", "us-west-2");
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

    test("setDefaultProvider beats the environment; an explicit provider beats both", () => {
        vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
        vi.stubEnv("AWS_REGION", "us-east-1");
        const ambient = fakeProvider("ambient");
        const explicit = fakeProvider("explicit");
        setDefaultProvider(ambient);

        expect(new VoyageAIClient().provider).toBe(ambient);
        expect(new VoyageAIClient({ provider: explicit }).provider).toBe(explicit);
        expect(getDefaultProvider()).toBe(ambient);
    });

    test("provider: null pins a client to the Voyage API", () => {
        setDefaultProvider(fakeProvider("ambient"));
        expect(new VoyageAIClient({ provider: null }).provider).toBeUndefined();
    });

    test("setDefaultProvider(null) pins new clients to the Voyage API, undefined restores the environment", () => {
        vi.stubEnv("VOYAGE_CLOUD_PROVIDER", "aws");
        vi.stubEnv("AWS_REGION", "us-east-1");

        setDefaultProvider(null);
        expect(new VoyageAIClient().provider).toBeUndefined();

        setDefaultProvider(undefined);
        expect(new VoyageAIClient().provider).toBeInstanceOf(SageMakerProvider);
    });

    test("the provider is picked at construction; later defaults leave existing clients alone", () => {
        const before = new VoyageAIClient({ apiKey: "key" });
        setDefaultProvider(fakeProvider("later"));
        expect(before.provider).toBeUndefined();
        expect(new VoyageAIClient().provider?.name).toBe("later");
    });

    test("a second copy of the module (e.g. the other of the CJS/ESM builds) sees the same default", async () => {
        const ambient = fakeProvider("ambient");
        setDefaultProvider(ambient);
        vi.resetModules();
        const copy = await import("../../../src/cloud/default-provider");
        expect(copy.getDefaultProvider()).toBe(ambient);
    });
});
