/**
 * SageMaker config parsing / validation and env settings.
 * Pure logic — no AWS packages, no network.
 */

import { afterEach, vi } from "vitest";
import { parseSageMakerOptions } from "../../../src/cloud/aws/config";

describe("parseSageMakerOptions", () => {
    test("empty object opts in; region from AWS_REGION", () => {
        const config = parseSageMakerOptions({}, { AWS_REGION: "us-east-1" });
        expect(config.region).toBe("us-east-1");
        expect(config.credentials).toEqual({ type: "default" });
        expect(config.endpointMap).toEqual({});
    });

    test("explicit region beats env", () => {
        const config = parseSageMakerOptions({ region: "eu-west-1" }, { AWS_REGION: "us-east-1" });
        expect(config.region).toBe("eu-west-1");
    });

    test("AWS_DEFAULT_REGION fallback", () => {
        const config = parseSageMakerOptions({}, { AWS_DEFAULT_REGION: "ap-south-1" });
        expect(config.region).toBe("ap-south-1");
    });

    test("missing region throws", () => {
        expect(() => parseSageMakerOptions({}, {})).toThrow(/requires a region/);
    });

    test("unknown key throws", () => {
        // @ts-expect-error intentionally invalid key
        expect(() => parseSageMakerOptions({ region: "us-east-1", bogus: 1 }, {})).toThrow(/unknown option/);
    });

    test("static credentials", () => {
        const config = parseSageMakerOptions(
            { region: "us-east-1", awsAccessKeyId: "AKIA", awsSecretAccessKey: "secret", awsSessionToken: "tok" },
            {},
        );
        expect(config.credentials).toEqual({
            type: "static",
            accessKeyId: "AKIA",
            secretAccessKey: "secret",
            sessionToken: "tok",
        });
    });

    test("half a key pair throws", () => {
        expect(() => parseSageMakerOptions({ region: "us-east-1", awsAccessKeyId: "AKIA" }, {})).toThrow(
            /must be provided together/,
        );
    });

    test("sessionToken without pair throws", () => {
        expect(() => parseSageMakerOptions({ region: "us-east-1", awsSessionToken: "tok" }, {})).toThrow(
            /only valid together with the key pair/,
        );
    });

    test("profile + keys mutually exclusive", () => {
        expect(() =>
            parseSageMakerOptions(
                { region: "us-east-1", profileName: "dev", awsAccessKeyId: "AKIA", awsSecretAccessKey: "s" },
                {},
            ),
        ).toThrow(/mutually exclusive/);
    });

    test("profile credential source", () => {
        const config = parseSageMakerOptions({ region: "us-east-1", profileName: "dev" }, {});
        expect(config.credentials).toEqual({ type: "profile", profileName: "dev" });
    });

    test("config is frozen", () => {
        const config = parseSageMakerOptions({ region: "us-east-1" }, {});
        expect(Object.isFrozen(config)).toBe(true);
        expect(Object.isFrozen(config.endpointMap)).toBe(true);
    });
});

describe("process.env defaults", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("parseSageMakerOptions reads the region from process.env when no env is passed", () => {
        vi.stubEnv("AWS_REGION", "ap-northeast-1");
        expect(parseSageMakerOptions({}).region).toBe("ap-northeast-1");
    });

    test("the retired VOYAGE_SAGEMAKER_ENDPOINT_MAP variable is ignored", () => {
        vi.stubEnv("AWS_REGION", "us-east-1");
        vi.stubEnv("VOYAGE_SAGEMAKER_ENDPOINT_MAP", "voyage-3=ep-a");
        expect(parseSageMakerOptions({}).endpointMap).toEqual({});
    });
});
