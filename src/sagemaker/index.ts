/**
 * AWS SageMaker support for the VoyageAI client.
 *
 * Public surface is intentionally small: the `awsSagemaker` constructor option and the
 * config/error types. There is deliberately NO `SageMakerClient` class — the existing
 * `VoyageAIClient` transparently routes to SageMaker when configured (spec G3/NG4).
 */

export type { AwsDeps, SageMakerSigner } from "./awsDeps.js";
export { loadAwsDeps } from "./awsDeps.js";
export type { AwsSagemakerOptions, SageMakerConfig, SageMakerCredentialSource } from "./config.js";
export {
    parseEndpointMapEnv,
    parseSagemakerOptions,
    resolveSageMakerConfig,
    sagemakerConfigFromEnv,
} from "./config.js";
export { SageMakerAuthError, SageMakerResolutionError } from "./errors.js";
export type { SageMakerDiscovery } from "./resolver.js";
export { matchesAtTokenBoundary, normalizeName, SageMakerEndpointResolver } from "./resolver.js";
export { SageMakerRuntime } from "./runtime.js";
