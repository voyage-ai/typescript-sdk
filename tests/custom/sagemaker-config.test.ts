/**
 * SageMaker config parsing / validation and env activation (spec §5, §6).
 * Pure logic — no AWS packages, no network.
 */

import {
    parseEndpointMapEnv,
    parseSagemakerOptions,
    resolveSageMakerConfig,
    sagemakerConfigFromEnv,
} from "../../src/sagemaker/config";

describe("parseSagemakerOptions", () => {
    test("empty object opts in; region from AWS_REGION", () => {
        const config = parseSagemakerOptions({}, { AWS_REGION: "us-east-1" });
        expect(config.region).toBe("us-east-1");
        expect(config.credentials).toEqual({ type: "default" });
        expect(config.endpointMap).toEqual({});
    });

    test("explicit region beats env", () => {
        const config = parseSagemakerOptions({ region: "eu-west-1" }, { AWS_REGION: "us-east-1" });
        expect(config.region).toBe("eu-west-1");
    });

    test("AWS_DEFAULT_REGION fallback", () => {
        const config = parseSagemakerOptions({}, { AWS_DEFAULT_REGION: "ap-south-1" });
        expect(config.region).toBe("ap-south-1");
    });

    test("missing region throws", () => {
        expect(() => parseSagemakerOptions({}, {})).toThrow(/requires a region/);
    });

    test("unknown key throws", () => {
        // @ts-expect-error intentionally invalid key
        expect(() => parseSagemakerOptions({ region: "us-east-1", bogus: 1 }, {})).toThrow(/unknown key/);
    });

    test("static credentials", () => {
        const config = parseSagemakerOptions(
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
        expect(() => parseSagemakerOptions({ region: "us-east-1", awsAccessKeyId: "AKIA" }, {})).toThrow(
            /must be provided together/,
        );
    });

    test("sessionToken without pair throws", () => {
        expect(() => parseSagemakerOptions({ region: "us-east-1", awsSessionToken: "tok" }, {})).toThrow(
            /only valid together with the key pair/,
        );
    });

    test("profile + keys mutually exclusive", () => {
        expect(() =>
            parseSagemakerOptions(
                { region: "us-east-1", profileName: "dev", awsAccessKeyId: "AKIA", awsSecretAccessKey: "s" },
                {},
            ),
        ).toThrow(/mutually exclusive/);
    });

    test("profile credential source", () => {
        const config = parseSagemakerOptions({ region: "us-east-1", profileName: "dev" }, {});
        expect(config.credentials).toEqual({ type: "profile", profileName: "dev" });
    });

    test("config is frozen", () => {
        const config = parseSagemakerOptions({ region: "us-east-1" }, {});
        expect(Object.isFrozen(config)).toBe(true);
        expect(Object.isFrozen(config.endpointMap)).toBe(true);
    });
});

describe("parseEndpointMapEnv", () => {
    test("parses comma-separated pairs", () => {
        expect(parseEndpointMapEnv("voyage-3=ep-a, voyage-3-large = ep-b ")).toEqual({
            "voyage-3": "ep-a",
            "voyage-3-large": "ep-b",
        });
    });

    test("skips blank fragments", () => {
        expect(parseEndpointMapEnv("voyage-3=ep-a,,")).toEqual({ "voyage-3": "ep-a" });
    });

    test("missing '=' throws", () => {
        expect(() => parseEndpointMapEnv("voyage-3")).toThrow(/malformed entry/);
    });

    test("empty side throws", () => {
        expect(() => parseEndpointMapEnv("voyage-3=")).toThrow(/empty model or endpoint/);
    });

    test("duplicate key throws", () => {
        expect(() => parseEndpointMapEnv("v=a,v=b")).toThrow(/duplicate model key/);
    });
});

describe("sagemakerConfigFromEnv", () => {
    test("absent flag -> undefined", () => {
        expect(sagemakerConfigFromEnv({ AWS_REGION: "us-east-1" })).toBeUndefined();
    });

    test.each(["0", "false", "no", "off", ""])("falsy '%s' -> undefined", (value) => {
        expect(sagemakerConfigFromEnv({ VOYAGE_SAGEMAKER: value, AWS_REGION: "us-east-1" })).toBeUndefined();
    });

    test.each(["1", "true", "YES", "On"])("truthy '%s' -> config", (value) => {
        const config = sagemakerConfigFromEnv({ VOYAGE_SAGEMAKER: value, AWS_REGION: "us-east-1" });
        expect(config?.region).toBe("us-east-1");
    });

    test("invalid value throws", () => {
        expect(() => sagemakerConfigFromEnv({ VOYAGE_SAGEMAKER: "maybe", AWS_REGION: "us-east-1" })).toThrow(
            /invalid value/,
        );
    });

    test("endpoint map from env", () => {
        const config = sagemakerConfigFromEnv({
            VOYAGE_SAGEMAKER: "1",
            VOYAGE_SAGEMAKER_ENDPOINT_MAP: "voyage-3=ep-a",
            AWS_REGION: "us-east-1",
        });
        expect(config?.endpointMap).toEqual({ "voyage-3": "ep-a" });
    });
});

describe("resolveSageMakerConfig", () => {
    test("constructor option wins over env", () => {
        const config = resolveSageMakerConfig(
            { region: "eu-west-1" },
            { VOYAGE_SAGEMAKER: "0", AWS_REGION: "us-east-1" },
        );
        expect(config?.region).toBe("eu-west-1");
    });

    test("falls back to env when option absent", () => {
        const config = resolveSageMakerConfig(undefined, { VOYAGE_SAGEMAKER: "1", AWS_REGION: "us-east-1" });
        expect(config?.region).toBe("us-east-1");
    });

    test("undefined when neither present", () => {
        expect(resolveSageMakerConfig(undefined, {})).toBeUndefined();
    });
});
