/**
 * The SageMaker client: `VoyageAIClient` with the SageMaker provider already configured.
 *
 * The constructor splits its options into the SageMaker deployment settings the provider
 * validates and the regular client options, so an application never assembles the provider by
 * hand. {@link sagemakerProvider} stays exported for callers that want to compose a provider
 * themselves — to share one across clients, or to inject test seams.
 */

import { VoyageAIClient, type VoyageAIClientOptions } from "../../extended/ExtendedClient.js";
import type { SageMakerOptions } from "./config.js";
import { type SageMakerProviderInternals, sagemakerProvider } from "./provider.js";

/** Options of {@link SageMakerVoyageAIClient}: the provider settings plus the regular client options. */
export type SageMakerClientOptions = SageMakerOptions & Omit<VoyageAIClientOptions, "provider">;

/**
 * A `VoyageAIClient` that routes `embed`, `rerank`, `multimodalEmbed` and `contextualizedEmbed`
 * to SageMaker endpoints. Model names, response envelopes and errors are the Voyage API's, so
 * this client and the regular one are interchangeable.
 *
 * The AWS SDK packages are loaded on first use and must be installed by the application:
 * `@aws-sdk/client-sagemaker`, `@aws-sdk/credential-providers`, `@smithy/signature-v4`,
 * `@smithy/protocol-http` and `@aws-crypto/sha256-js`.
 *
 * @example
 *     const client = new SageMakerVoyageAIClient({ region: "us-east-1" });
 *     await client.embed({ input: "hello world", model: "voyage-3-large" });
 */
export class SageMakerVoyageAIClient extends VoyageAIClient {
    constructor(options: SageMakerClientOptions = {}, internals?: SageMakerProviderInternals) {
        const { region, awsAccessKeyId, awsSecretAccessKey, awsSessionToken, profileName, ...clientOptions } = options;
        super({
            ...clientOptions,
            provider: sagemakerProvider(
                { region, awsAccessKeyId, awsSecretAccessKey, awsSessionToken, profileName },
                internals,
            ),
        });
    }
}
