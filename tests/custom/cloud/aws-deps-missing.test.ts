/**
 * The AWS SDK packages are optional for `voyageai` and are not installed in this repository, so
 * this exercises the real failure path: the first SageMaker use fails with an install hint naming
 * every missing package, instead of a raw module-resolution error — and nothing fails earlier.
 */

import { describe, expect, test } from "vitest";
import { AWS_SDK_PACKAGES, AwsDependencyError, loadAwsDeps } from "../../../src/cloud/aws/awsDeps";
import { SageMakerVoyageAIClient } from "../../../src/cloud/aws/client";
import { sagemakerProvider } from "../../../src/cloud/aws/provider";

describe("missing AWS SDK packages", () => {
    test("loadAwsDeps names every missing package and the install command", async () => {
        const error = await loadAwsDeps().then(
            () => undefined,
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(AwsDependencyError);
        const depsError = error as AwsDependencyError;
        // Always in AWS_SDK_PACKAGES order, whichever import fails first.
        expect(depsError.missing).toEqual(AWS_SDK_PACKAGES);
        expect(depsError.broken).toEqual([]);
        expect(depsError.message).toContain("needs packages that are not installed");
        expect(depsError.message).toContain("Install them alongside voyageai to use SageMaker");
        expect(depsError.message).toContain(`npm install ${AWS_SDK_PACKAGES.join(" ")}`);
        expect(depsError.cause).toBeInstanceOf(Error);
    });

    test("the provider surfaces the hint on first resolve, not at construction", async () => {
        const provider = sagemakerProvider({ region: "us-east-1" });
        await expect(provider.resolve("voyage-3.5")).rejects.toThrow(/needs packages that are not installed/);
    });

    test("the client surfaces the hint on the first call, even with a Voyage API key", async () => {
        const client = new SageMakerVoyageAIClient({ region: "us-east-1", apiKey: "key" });
        await expect(client.embed({ model: "voyage-3.5", input: "hi" })).rejects.toBeInstanceOf(AwsDependencyError);
    });
});
