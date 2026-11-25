/**
 * AWS SageMaker configuration parsing and validation.
 *
 * Follows the Python SDK's `voyageai_cloud.aws` config, minus its explicit model-to-endpoint map:
 * endpoints are found by discovery or the `voyageai:model` endpoint tag only. The options passed to
 * `sagemakerProvider` are parsed exactly once, when the provider is built, into a frozen
 * `SageMakerConfig`; `region` may fall back to the standard AWS environment. All validation
 * errors are raised there, never at first call. Credential *resolution* (finding the actual
 * keys) is deferred to the first SageMaker request.
 */

/** Public options accepted by `sagemakerProvider`. */
export interface SageMakerOptions {
    /** AWS region of the endpoints. Falls back to `AWS_REGION` / `AWS_DEFAULT_REGION`. */
    region?: string;
    /** Explicit static credentials. */
    awsAccessKeyId?: string;
    /** Must be present iff `awsAccessKeyId` is present. */
    awsSecretAccessKey?: string;
    /** Optional; only valid together with the key pair. */
    awsSessionToken?: string;
    /** Named AWS profile. Mutually exclusive with explicit keys. */
    profileName?: string;
}

/** How credentials should be sourced when the AWS session is built. */
export type SageMakerCredentialSource =
    | {
          readonly type: "static";
          readonly accessKeyId: string;
          readonly secretAccessKey: string;
          readonly sessionToken?: string;
      }
    | { readonly type: "profile"; readonly profileName: string }
    | { readonly type: "default" };

/** Frozen, validated SageMaker configuration. */
export interface SageMakerConfig {
    readonly region: string;
    readonly credentials: SageMakerCredentialSource;
}

const ALLOWED_KEYS: readonly string[] = [
    "region",
    "awsAccessKeyId",
    "awsSecretAccessKey",
    "awsSessionToken",
    "profileName",
];

type EnvLike = Record<string, string | undefined>;

function resolveRegion(region: string | undefined, env: EnvLike): string {
    const resolved = region ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION;
    if (resolved == null || resolved.length === 0) {
        throw new Error(
            "SageMaker requires a region. Set `region` in the sagemakerProvider options, or the " +
                "AWS_REGION / AWS_DEFAULT_REGION environment variable.",
        );
    }
    return resolved;
}

function buildCredentialSource(options: SageMakerOptions): SageMakerCredentialSource {
    const hasAccessKey = options.awsAccessKeyId != null;
    const hasSecretKey = options.awsSecretAccessKey != null;
    const hasSessionToken = options.awsSessionToken != null;
    const hasProfile = options.profileName != null;

    if (hasProfile && (hasAccessKey || hasSecretKey || hasSessionToken)) {
        throw new Error("SageMaker: profileName is mutually exclusive with explicit AWS credentials.");
    }

    if (hasAccessKey !== hasSecretKey) {
        throw new Error("SageMaker: awsAccessKeyId and awsSecretAccessKey must be provided together.");
    }

    if (hasSessionToken && !hasAccessKey) {
        throw new Error("SageMaker: awsSessionToken is only valid together with the key pair.");
    }

    if (hasAccessKey) {
        return {
            type: "static",
            accessKeyId: options.awsAccessKeyId as string,
            secretAccessKey: options.awsSecretAccessKey as string,
            sessionToken: options.awsSessionToken,
        };
    }

    if (hasProfile) {
        return { type: "profile", profileName: options.profileName as string };
    }

    return { type: "default" };
}

/**
 * Parse the provider options (including the empty-object form) into a validated
 * {@link SageMakerConfig}. Unknown keys, missing region, and credential combinations all
 * raise here.
 */
export function parseSageMakerOptions(
    options: SageMakerOptions,
    env: EnvLike = typeof process !== "undefined" ? process.env : {},
): SageMakerConfig {
    const unknownKeys = Object.keys(options).filter((key) => !ALLOWED_KEYS.includes(key));
    if (unknownKeys.length > 0) {
        throw new Error(
            `SageMaker: unknown option(s) ${JSON.stringify(unknownKeys)}. Allowed options: ${JSON.stringify(ALLOWED_KEYS)}.`,
        );
    }

    const region = resolveRegion(options.region, env);
    const credentials = buildCredentialSource(options);

    return Object.freeze({ region, credentials });
}
