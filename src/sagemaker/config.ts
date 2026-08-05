/**
 * AWS SageMaker configuration parsing and validation.
 *
 * Mirrors the Python SDK's `voyageai.sagemaker.config.SageMakerConfig`: the public
 * `awsSagemaker` option (or the environment variables) is parsed exactly once at
 * client construction into a frozen `SageMakerConfig`. All validation errors are
 * raised here (at construction), never at first call. Credential *resolution*
 * (finding the actual keys) is deferred to the first SageMaker request.
 */

/** Public constructor option accepted by the extended client. */
export interface AwsSagemakerOptions {
    /** AWS region of the endpoints. Falls back to `AWS_REGION` / `AWS_DEFAULT_REGION`. */
    region?: string;
    /** Explicit `model name -> endpoint name` overrides. Highest-priority resolution tier. */
    endpointMap?: Record<string, string>;
    /** Explicit static credentials. */
    awsAccessKeyId?: string;
    /** Must be present iff `awsAccessKeyId` is present. */
    awsSecretAccessKey?: string;
    /** Optional; only valid together with the key pair. */
    awsSessionToken?: string;
    /** Named AWS profile. Mutually exclusive with explicit keys. */
    profileName?: string;
}

/** How credentials should be sourced when a botocore-equivalent session is built. */
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
    readonly endpointMap: Readonly<Record<string, string>>;
    readonly credentials: SageMakerCredentialSource;
}

const ALLOWED_KEYS: readonly string[] = [
    "region",
    "endpointMap",
    "awsAccessKeyId",
    "awsSecretAccessKey",
    "awsSessionToken",
    "profileName",
];

const TRUTHY_ENV_VALUES: readonly string[] = ["1", "true", "yes", "on"];
const FALSY_ENV_VALUES: readonly string[] = ["0", "false", "no", "off", ""];

type EnvLike = Record<string, string | undefined>;

function resolveRegion(region: string | undefined, env: EnvLike): string {
    const resolved = region ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION;
    if (resolved == null || resolved.length === 0) {
        throw new Error(
            "aws_sagemaker requires a region. Set `region` in the awsSagemaker option, or the " +
                "AWS_REGION / AWS_DEFAULT_REGION environment variable.",
        );
    }
    return resolved;
}

function buildCredentialSource(options: AwsSagemakerOptions): SageMakerCredentialSource {
    const hasAccessKey = options.awsAccessKeyId != null;
    const hasSecretKey = options.awsSecretAccessKey != null;
    const hasSessionToken = options.awsSessionToken != null;
    const hasProfile = options.profileName != null;

    if (hasProfile && (hasAccessKey || hasSecretKey || hasSessionToken)) {
        throw new Error("aws_sagemaker: profileName is mutually exclusive with explicit AWS credentials.");
    }

    if (hasAccessKey !== hasSecretKey) {
        throw new Error("aws_sagemaker: awsAccessKeyId and awsSecretAccessKey must be provided together.");
    }

    if (hasSessionToken && !hasAccessKey) {
        throw new Error("aws_sagemaker: awsSessionToken is only valid together with the key pair.");
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
 * Parse the `awsSagemaker` constructor option (including the empty-object opt-in) into a
 * validated {@link SageMakerConfig}. Unknown keys, missing region, and credential
 * combinations all raise here.
 */
export function parseSagemakerOptions(
    options: AwsSagemakerOptions,
    env: EnvLike = typeof process !== "undefined" ? process.env : {},
): SageMakerConfig {
    const unknownKeys = Object.keys(options).filter((key) => !ALLOWED_KEYS.includes(key));
    if (unknownKeys.length > 0) {
        throw new Error(
            `aws_sagemaker: unknown key(s) ${JSON.stringify(unknownKeys)}. Allowed keys: ${JSON.stringify(ALLOWED_KEYS)}.`,
        );
    }

    const region = resolveRegion(options.region, env);
    const credentials = buildCredentialSource(options);
    const endpointMap: Record<string, string> = { ...(options.endpointMap ?? {}) };

    return Object.freeze({ region, endpointMap: Object.freeze(endpointMap), credentials });
}

/**
 * Parse the `VOYAGE_SAGEMAKER_ENDPOINT_MAP` value: comma-separated `model=endpoint`
 * pairs. Malformed entries (missing `=`, empty side, duplicate key) raise, quoting the
 * offending fragment.
 */
export function parseEndpointMapEnv(raw: string): Record<string, string> {
    const map: Record<string, string> = {};
    const fragments = raw.split(",");
    for (const fragment of fragments) {
        const trimmed = fragment.trim();
        if (trimmed.length === 0) {
            continue;
        }
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) {
            throw new Error(`VOYAGE_SAGEMAKER_ENDPOINT_MAP: malformed entry '${trimmed}' (expected 'model=endpoint').`);
        }
        const model = trimmed.slice(0, eqIndex).trim();
        const endpoint = trimmed.slice(eqIndex + 1).trim();
        if (model.length === 0 || endpoint.length === 0) {
            throw new Error(`VOYAGE_SAGEMAKER_ENDPOINT_MAP: malformed entry '${trimmed}' (empty model or endpoint).`);
        }
        if (Object.prototype.hasOwnProperty.call(map, model)) {
            throw new Error(`VOYAGE_SAGEMAKER_ENDPOINT_MAP: duplicate model key '${model}'.`);
        }
        map[model] = endpoint;
    }
    return map;
}

/**
 * Evaluate environment-variable activation. Returns a config when `VOYAGE_SAGEMAKER`
 * is truthy, `undefined` when it is falsy/absent, and throws on an invalid value.
 * Only consulted when the `awsSagemaker` constructor arg is absent (constructor wins).
 */
export function sagemakerConfigFromEnv(
    env: EnvLike = typeof process !== "undefined" ? process.env : {},
): SageMakerConfig | undefined {
    const flag = env.VOYAGE_SAGEMAKER;
    if (flag == null) {
        return undefined;
    }
    const normalized = flag.trim().toLowerCase();
    if (FALSY_ENV_VALUES.includes(normalized)) {
        return undefined;
    }
    if (!TRUTHY_ENV_VALUES.includes(normalized)) {
        throw new Error(
            `VOYAGE_SAGEMAKER: invalid value '${flag}'. Allowed values: ` +
                `${JSON.stringify([...TRUTHY_ENV_VALUES, ...FALSY_ENV_VALUES.filter((v) => v.length > 0)])}.`,
        );
    }

    const rawMap = env.VOYAGE_SAGEMAKER_ENDPOINT_MAP;
    const options: AwsSagemakerOptions = {};
    if (rawMap != null && rawMap.trim().length > 0) {
        options.endpointMap = parseEndpointMapEnv(rawMap);
    }
    // Region + credentials come from the standard AWS environment / default chain.
    return parseSagemakerOptions(options, env);
}

/**
 * Resolve the effective config for a client: the constructor option always wins; when
 * it is absent the environment is consulted. Returns `undefined` when SageMaker is not
 * activated at all.
 */
export function resolveSageMakerConfig(
    awsSagemaker: AwsSagemakerOptions | undefined,
    env: EnvLike = typeof process !== "undefined" ? process.env : {},
): SageMakerConfig | undefined {
    if (awsSagemaker !== undefined) {
        return parseSagemakerOptions(awsSagemaker, env);
    }
    return sagemakerConfigFromEnv(env);
}
