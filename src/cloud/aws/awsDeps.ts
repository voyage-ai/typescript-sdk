/**
 * Lazy AWS SDK loader.
 *
 * This is the ONLY module that imports the AWS SDK v3 packages. They are optional for `voyageai`:
 * only SageMaker users install them, so the application pins and upgrades them itself and they are
 * never bundled. They are imported via dynamic `import()` on first SageMaker use, which keeps
 * importing the SDK and constructing the provider cheap for everyone else. If a load fails (not
 * installed, or a broken install), {@link loadAwsDeps} throws an {@link AwsDependencyError} naming
 * the affected packages and their install command.
 */

import { ProviderResolutionError } from "../providers.js";
import type { SageMakerConfig, SageMakerCredentialSource } from "./config.js";
import type { SageMakerDiscovery } from "./resolver.js";

/** Signs a request with SigV4 and returns the complete header set to transmit. */
export interface SageMakerSigner {
    sign(args: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: string;
    }): Promise<Record<string, string>>;
}

/** Factory bundle produced by {@link loadAwsDeps}; injectable for testing. */
export interface AwsDeps {
    createSigner(config: SageMakerConfig): SageMakerSigner;
    createDiscovery(config: SageMakerConfig): SageMakerDiscovery;
}

/** The AWS SDK packages the SageMaker provider loads (installed by the application). */
export const AWS_SDK_PACKAGES: readonly string[] = [
    "@smithy/signature-v4",
    "@smithy/protocol-http",
    "@aws-crypto/sha256-js",
    "@aws-sdk/credential-providers",
    "@aws-sdk/client-sagemaker",
];

// biome-ignore lint/suspicious/noExplicitAny: dynamically imported optional deps are untyped here on purpose.
type AnyModule = any;

/** One AWS package that failed to import. */
interface ImportFailure {
    readonly name: string;
    readonly error: unknown;
}

/**
 * Thrown on first SageMaker use when AWS SDK packages cannot be found (`missing`, e.g. a pruned
 * install or packages never added to the application) or are present but fail to load (`broken`,
 * e.g. two incompatible major versions in one tree). The message names exactly the affected
 * packages and, for missing ones, the install command; the first underlying import error is kept
 * as `cause`.
 */
export class AwsDependencyError extends Error {
    public readonly missing: readonly string[];
    public readonly broken: readonly string[];
    public readonly cause: unknown;

    constructor(missing: readonly ImportFailure[], broken: readonly ImportFailure[]) {
        const lines: string[] = [];
        if (missing.length > 0) {
            const names = missing.map((failure) => failure.name);
            lines.push(
                `AWS SageMaker support needs packages that are not installed: ${names.join(", ")}.`,
                `Install them alongside voyageai to use SageMaker:  npm install ${names.join(" ")}`,
            );
        }
        for (const { name, error } of broken) {
            lines.push(
                `AWS SDK package ${name} is installed but failed to load (${errorMessage(error)}). ` +
                    `Check for a conflicting version in your dependency tree: npm ls ${name}`,
            );
        }
        super(lines.join("\n"));
        Object.setPrototypeOf(this, AwsDependencyError.prototype);
        this.name = "AwsDependencyError";
        this.missing = missing.map((failure) => failure.name);
        this.broken = broken.map((failure) => failure.name);
        this.cause = (broken[0] ?? missing[0])?.error;
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * True when the import failed because `name` itself cannot be resolved — CJS says
 * "Cannot find module 'x'", ESM "Cannot find package 'x'". A missing *transitive* dependency
 * names a different package and counts as broken, not missing.
 */
function isPackageMissing(failure: ImportFailure): boolean {
    // Walk the `cause` chain: bundlers and test runners may wrap the resolver's error.
    for (let error = failure.error, depth = 0; error != null && depth < 5; depth++) {
        const message = errorMessage(error);
        if (/Cannot find (module|package)/.test(message) && message.includes(`'${failure.name}'`)) {
            return true;
        }
        error = (error as { cause?: unknown }).cause;
    }
    return false;
}

/**
 * Import every AWS SDK package, reporting ALL problems at once (not just the first), so a user
 * fixes their install in a single step. Failures are listed in {@link AWS_SDK_PACKAGES} order, so
 * the message and its install command are stable. `as string` keeps the specifier out of
 * TypeScript's build-time module resolution.
 */
async function importAwsPackages(): Promise<AnyModule[]> {
    const results = await Promise.all(
        AWS_SDK_PACKAGES.map((name) =>
            import(name as string).then(
                (module: AnyModule) => ({ name, module, error: undefined, failed: false }),
                (error: unknown) => ({ name, module: undefined, error, failed: true }),
            ),
        ),
    );
    const failures: ImportFailure[] = results.filter((result) => result.failed);
    const modules = results.map((result) => result.module);
    if (failures.length > 0) {
        throw new AwsDependencyError(
            failures.filter(isPackageMissing),
            failures.filter((f) => !isPackageMissing(f)),
        );
    }
    return modules;
}

/** Endpoint tag used by the resolver's tie-break. */
const MODEL_TAG_KEY = "voyageai:model";

function buildCredentialProvider(source: SageMakerCredentialSource, credentialProviders: AnyModule): unknown {
    switch (source.type) {
        case "static":
            return {
                accessKeyId: source.accessKeyId,
                secretAccessKey: source.secretAccessKey,
                sessionToken: source.sessionToken,
            };
        case "profile":
            return credentialProviders.fromIni({ profile: source.profileName });
        default:
            // Full default chain: env -> shared config -> IMDS/IRSA/SSO.
            return credentialProviders.fromNodeProviderChain();
    }
}

function isAccessDenied(error: unknown): boolean {
    if (error == null || typeof error !== "object") {
        return false;
    }
    const name = (error as { name?: string }).name;
    return name === "AccessDeniedException" || name === "AccessDenied";
}

/**
 * Dynamically import the AWS SDK packages and build the signer/discovery factories.
 * Throws {@link AwsDependencyError} naming every missing or unloadable package.
 */
export async function loadAwsDeps(): Promise<AwsDeps> {
    const [signatureV4Mod, protocolHttpMod, sha256Mod, credentialProviders, sagemakerMod] = await importAwsPackages();

    const { SignatureV4 } = signatureV4Mod;
    const { HttpRequest } = protocolHttpMod;
    const { Sha256 } = sha256Mod;
    const {
        SageMakerClient,
        ListEndpointsCommand,
        ListTagsCommand,
        DescribeEndpointCommand,
        DescribeEndpointConfigCommand,
        DescribeModelCommand,
        DescribeModelPackageCommand,
    } = sagemakerMod;

    const createSigner = (config: SageMakerConfig): SageMakerSigner => {
        const credentials = buildCredentialProvider(config.credentials, credentialProviders);
        const signer = new SignatureV4({
            service: "sagemaker",
            region: config.region,
            credentials,
            sha256: Sha256,
        });
        return {
            async sign({ method, url, headers, body }): Promise<Record<string, string>> {
                const parsed = new URL(url);
                const request = new HttpRequest({
                    method,
                    protocol: parsed.protocol,
                    hostname: parsed.hostname,
                    port: parsed.port ? Number(parsed.port) : undefined,
                    path: parsed.pathname,
                    query: Object.fromEntries(parsed.searchParams.entries()),
                    headers: { ...headers, host: parsed.hostname },
                    body,
                });
                // Fresh credentials per request (SigV4 pulls from the provider each sign),
                // never cached across requests so rotating IAM-role creds stay valid.
                const signed = await signer.sign(request);
                return signed.headers as Record<string, string>;
            },
        };
    };

    const createDiscovery = (config: SageMakerConfig): SageMakerDiscovery => {
        const clientConfig: Record<string, unknown> = { region: config.region };
        if (config.credentials.type === "static") {
            clientConfig.credentials = {
                accessKeyId: config.credentials.accessKeyId,
                secretAccessKey: config.credentials.secretAccessKey,
                sessionToken: config.credentials.sessionToken,
            };
        } else if (config.credentials.type === "profile") {
            clientConfig.credentials = credentialProviders.fromIni({ profile: config.credentials.profileName });
        }
        const client = new SageMakerClient(clientConfig);
        const endpointArns: Map<string, string | undefined> = new Map();

        const guard = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
            try {
                return await fn();
            } catch (error) {
                if (isAccessDenied(error)) {
                    throw new ProviderResolutionError(
                        `AWS credentials lack permission for SageMaker endpoint discovery (${action}). ` +
                            "Grant sagemaker:ListEndpoints, DescribeEndpoint, DescribeEndpointConfig, DescribeModel, " +
                            "DescribeModelPackage, and ListTags (in addition to sagemaker:InvokeEndpoint).",
                        "authentication",
                    );
                }
                throw error;
            }
        };

        const describeEndpoint = async (
            endpointName: string,
        ): Promise<{ EndpointConfigName?: string; EndpointArn?: string }> => {
            const endpoint = (await guard("sagemaker:DescribeEndpoint", () =>
                client.send(new DescribeEndpointCommand({ EndpointName: endpointName })),
            )) as { EndpointConfigName?: string; EndpointArn?: string };
            endpointArns.set(endpointName, endpoint.EndpointArn);
            return endpoint;
        };

        return {
            async listInServiceEndpointNames(): Promise<string[]> {
                return guard("sagemaker:ListEndpoints", async () => {
                    const names: string[] = [];
                    let nextToken: string | undefined;
                    do {
                        const response = await client.send(
                            new ListEndpointsCommand({ StatusEquals: "InService", NextToken: nextToken }),
                        );
                        for (const ep of response.Endpoints ?? []) {
                            if (ep.EndpointName) {
                                names.push(ep.EndpointName);
                                endpointArns.set(ep.EndpointName, ep.EndpointArn);
                            }
                        }
                        nextToken = response.NextToken;
                    } while (nextToken);
                    return names;
                });
            },

            async getEndpointProductId(endpointName: string): Promise<string | undefined> {
                const endpoint = await describeEndpoint(endpointName);
                const configName = endpoint.EndpointConfigName;
                if (!configName) {
                    return undefined;
                }
                const endpointConfig = (await guard("sagemaker:DescribeEndpointConfig", () =>
                    client.send(new DescribeEndpointConfigCommand({ EndpointConfigName: configName })),
                )) as { ProductionVariants?: Array<{ ModelName?: string }> };
                // A single endpoint serves one model; take the first production variant.
                const modelName = endpointConfig.ProductionVariants?.[0]?.ModelName;
                if (!modelName) {
                    return undefined;
                }
                const model = (await guard("sagemaker:DescribeModel", () =>
                    client.send(new DescribeModelCommand({ ModelName: modelName })),
                )) as {
                    PrimaryContainer?: { ModelPackageName?: string };
                    Containers?: Array<{ ModelPackageName?: string }>;
                };
                // Marketplace deploys populate PrimaryContainer; console-created ones populate
                // Containers[0]. Check both — reading only PrimaryContainer misses the latter.
                const container = model.PrimaryContainer ?? model.Containers?.[0];
                const packageName = container?.ModelPackageName;
                if (!packageName) {
                    // Not backed by a model package (self-built model) — not a Marketplace listing.
                    return undefined;
                }
                const pkg = (await guard("sagemaker:DescribeModelPackage", () =>
                    client.send(new DescribeModelPackageCommand({ ModelPackageName: packageName })),
                )) as { InferenceSpecification?: { Containers?: Array<{ ProductId?: string }> } };
                // A missing ProductId means the package is not a Marketplace product (e.g. a
                // self-built package); treat it as unidentifiable rather than guessing.
                return pkg.InferenceSpecification?.Containers?.[0]?.ProductId ?? undefined;
            },

            async getEndpointModelTag(endpointName: string): Promise<string | undefined> {
                let arn = endpointArns.get(endpointName);
                if (arn === undefined && !endpointArns.has(endpointName)) {
                    arn = (await describeEndpoint(endpointName)).EndpointArn;
                }
                if (!arn) {
                    return undefined;
                }
                const tags = (await guard("sagemaker:ListTags", () =>
                    client.send(new ListTagsCommand({ ResourceArn: arn })),
                )) as { Tags?: Array<{ Key?: string; Value?: string }> };
                return tags.Tags?.find((tag) => tag.Key === MODEL_TAG_KEY)?.Value ?? undefined;
            },
        };
    };

    return { createSigner, createDiscovery };
}
