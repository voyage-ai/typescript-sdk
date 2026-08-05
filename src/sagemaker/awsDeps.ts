/**
 * Lazy AWS SDK loader (spec §4 D2/D3, §8).
 *
 * This is the ONLY module that imports the AWS SDK v3 packages, and it does so via
 * dynamic `import()` executed only when the SageMaker path is actually activated. That
 * keeps `import { VoyageAIClient }`, client construction, and every non-SageMaker call
 * working with the AWS packages absent (they are optional peer dependencies). If the
 * SageMaker path is activated and the packages are missing, {@link loadAwsDeps} throws a
 * clear install hint.
 *
 * Async note (spec T9/X5): all AWS control-plane calls and SigV4 signing are performed
 * with the standard synchronous/promise SDK APIs and dispatched over the SDK's existing
 * fetch machinery — there is no aioboto3 equivalent and none is needed.
 */

import type { SageMakerConfig, SageMakerCredentialSource } from "./config.js";
import { SageMakerAuthError } from "./errors.js";
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

const MISSING_DEPS_MESSAGE: string =
    "The AWS SDK packages are required for AWS SageMaker support. Please run " +
    "`npm install @aws-sdk/client-sagemaker @aws-sdk/credential-providers @smithy/signature-v4 " +
    "@smithy/protocol-http @aws-crypto/sha256-js` (or the equivalent with your package manager) to install them.";

// biome-ignore lint/suspicious/noExplicitAny: dynamically imported optional deps are untyped here on purpose.
type AnyModule = any;

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
 * Throws {@link Error} with an install hint if any package is missing.
 */
export async function loadAwsDeps(): Promise<AwsDeps> {
    let signatureV4Mod: AnyModule;
    let protocolHttpMod: AnyModule;
    let sha256Mod: AnyModule;
    let credentialProviders: AnyModule;
    let sagemakerMod: AnyModule;
    try {
        [signatureV4Mod, protocolHttpMod, sha256Mod, credentialProviders, sagemakerMod] = await Promise.all([
            import("@smithy/signature-v4" as string),
            import("@smithy/protocol-http" as string),
            import("@aws-crypto/sha256-js" as string),
            import("@aws-sdk/credential-providers" as string),
            import("@aws-sdk/client-sagemaker" as string),
        ]);
    } catch (_error) {
        throw new Error(MISSING_DEPS_MESSAGE);
    }

    const { SignatureV4 } = signatureV4Mod;
    const { HttpRequest } = protocolHttpMod;
    const { Sha256 } = sha256Mod;
    const {
        SageMakerClient,
        ListEndpointsCommand,
        DescribeEndpointCommand,
        DescribeEndpointConfigCommand,
        DescribeModelCommand,
        ListTagsCommand,
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

        const guard = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
            try {
                return await fn();
            } catch (error) {
                if (isAccessDenied(error)) {
                    throw new SageMakerAuthError(
                        `AWS credentials lack permission for SageMaker endpoint discovery (${action}). ` +
                            "Either grant sagemaker:ListEndpoints/ListTags/DescribeEndpoint/DescribeEndpointConfig/" +
                            "DescribeModel, or bypass discovery with endpointMap.",
                    );
                }
                throw error;
            }
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
                            }
                        }
                        nextToken = response.NextToken;
                    } while (nextToken);
                    return names;
                });
            },

            async getEndpointModelPackageArns(endpointName: string): Promise<string[]> {
                return guard("sagemaker:DescribeEndpoint", async () => {
                    const endpoint = await client.send(new DescribeEndpointCommand({ EndpointName: endpointName }));
                    const configName = endpoint.EndpointConfigName;
                    if (!configName) {
                        return [];
                    }
                    const endpointConfig = await client.send(
                        new DescribeEndpointConfigCommand({ EndpointConfigName: configName }),
                    );
                    const modelNames: string[] = [];
                    for (const variant of endpointConfig.ProductionVariants ?? []) {
                        if (variant.ModelName) {
                            modelNames.push(variant.ModelName);
                        }
                    }
                    const arns: string[] = [];
                    for (const modelName of modelNames) {
                        const model = await client.send(new DescribeModelCommand({ ModelName: modelName }));
                        const primary = model.PrimaryContainer?.ModelPackageName;
                        if (primary) {
                            arns.push(primary);
                        }
                        for (const container of model.Containers ?? []) {
                            if (container.ModelPackageName) {
                                arns.push(container.ModelPackageName);
                            }
                        }
                    }
                    return arns;
                });
            },

            async getEndpointModelTag(endpointName: string): Promise<string | undefined> {
                return guard("sagemaker:ListTags", async () => {
                    const endpoint = await client.send(new DescribeEndpointCommand({ EndpointName: endpointName }));
                    const arn = endpoint.EndpointArn;
                    if (!arn) {
                        return undefined;
                    }
                    let nextToken: string | undefined;
                    do {
                        const response = await client.send(
                            new ListTagsCommand({ ResourceArn: arn, NextToken: nextToken }),
                        );
                        for (const tag of response.Tags ?? []) {
                            if (tag.Key === "voyageai:model") {
                                return tag.Value;
                            }
                        }
                        nextToken = response.NextToken;
                    } while (nextToken);
                    return undefined;
                });
            },
        };
    };

    return { createSigner, createDiscovery };
}
