/**
 * Cloud providers: the provider seam and the per-cloud implementations (AWS SageMaker today).
 *
 * Nothing here is generated, and nothing here changes generated code: a provider's transport runs
 * underneath the generated client through its public `fetch` option (see `transport-fetch.ts`).
 * Cloud SDKs are never imported eagerly — each provider loads its SDK on first use, so they stay
 * optional for every application that does not use that cloud.
 *
 * Clients created without a `provider` option follow the ambient configuration
 * (`setDefaultProvider`, then `VOYAGE_CLOUD_PROVIDER`), so code that builds its own client — such as
 * a LangChain or LlamaIndex integration — reaches a cloud provider unchanged.
 */

export type { AwsDeps, SageMakerSigner } from "./aws/awsDeps.js";
export { AWS_SDK_PACKAGES, AwsDependencyError, loadAwsDeps } from "./aws/awsDeps.js";
export type { SageMakerClientOptions } from "./aws/client.js";
export { SageMakerVoyageAIClient } from "./aws/client.js";
export type { SageMakerConfig, SageMakerCredentialSource, SageMakerOptions } from "./aws/config.js";
export { parseSageMakerOptions } from "./aws/config.js";
export { mapSageMakerError } from "./aws/errors.js";
export { PRODUCT_MAP } from "./aws/productMap.js";
export type { SageMakerProviderInternals } from "./aws/provider.js";
export { SageMakerProvider, sagemakerProvider } from "./aws/provider.js";
export type { SageMakerDiscovery } from "./aws/resolver.js";
export { normalizeName, SageMakerEndpointResolver } from "./aws/resolver.js";
export { sageMakerResponseHandler } from "./aws/responses.js";
export { getDefaultProvider, PROVIDER_ENV_VAR, providerFromEnv, setDefaultProvider } from "./default-provider.js";
export {
    CONTEXTUALIZED_RESPONSE_KEYS,
    EMBED_RESPONSE_KEYS,
    normalizeEmbeddingBody,
    RERANK_RESPONSE_KEYS,
    stripUnknownTopLevelKeys,
} from "./normalize.js";
export type {
    AuthStrategy,
    Provider,
    ProviderResolutionErrorKind,
    ProviderResponseHandler,
    ResponseHeaders,
    Transport,
    VoyageApiResponse,
    VoyageOperation,
} from "./providers.js";
export { isProviderResolutionError, ProviderResolutionError, pathFor } from "./providers.js";
export { createTransportFetch } from "./transport-fetch.js";
