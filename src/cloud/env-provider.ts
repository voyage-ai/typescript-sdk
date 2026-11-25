/**
 * Cloud provider selection from the environment.
 *
 * A client constructed without a `provider` option reads `VOYAGE_CLOUD_PROVIDER`, the same way the
 * generated client reads `VOYAGE_API_KEY`. The choice is made here, inside the SDK, from deployment
 * configuration only, so code that builds its own client — LangChain, LlamaIndex and other
 * integrations — reaches a cloud provider without any change and without knowing about providers.
 *
 * Values are shared with the Python SDK: unset, empty or `voyage` mean the Voyage API; `aws` means
 * SageMaker, configured from the standard AWS environment (region from `AWS_REGION` /
 * `AWS_DEFAULT_REGION`, credentials from the default chain including `AWS_PROFILE`, endpoints found
 * by discovery or the `voyageai:model` endpoint tag). `azure` and `gcp` are reserved.
 *
 * The variable is read when a client is constructed, so a misconfiguration (say, `aws` without a
 * region) fails there.
 */

import { SageMakerProvider } from "./aws/provider.js";
import type { Provider } from "./providers.js";

/** Environment variable that selects the provider of clients created without one. */
export const PROVIDER_ENV_VAR = "VOYAGE_CLOUD_PROVIDER";

type EnvLike = Record<string, string | undefined>;

/** Provider aliases reserved for clouds this version does not support yet. */
const RESERVED_ALIASES: readonly string[] = ["azure", "gcp"];

function processEnv(): EnvLike {
    return typeof process !== "undefined" ? process.env : {};
}

/**
 * Build the provider named by `VOYAGE_CLOUD_PROVIDER`, or `undefined` for the Voyage API. Throws for
 * reserved or unknown values, and when the named provider is misconfigured.
 */
export function providerFromEnv(env: EnvLike = processEnv()): Provider | undefined {
    const alias = env[PROVIDER_ENV_VAR]?.trim();
    if (alias == null || alias.length === 0 || alias === "voyage") {
        return undefined;
    }
    if (alias === "aws") {
        return new SageMakerProvider({}, { env });
    }
    if (RESERVED_ALIASES.includes(alias)) {
        throw new Error(
            `${PROVIDER_ENV_VAR}=${alias}: the '${alias}' provider is reserved but not yet available in this version of voyageai.`,
        );
    }
    throw new Error(`${PROVIDER_ENV_VAR}=${alias}: unknown provider. Use one of: voyage, aws.`);
}

/** Providers built from the environment, keyed by the variables they were built from. */
const environmentProviders: Map<string, Provider | undefined> = new Map();

/**
 * The provider for a client constructed now without a `provider` option. Clients built from the same
 * settings share one provider, so endpoint discovery and credential loading happen once per process.
 */
export function environmentProvider(env: EnvLike = processEnv()): Provider | undefined {
    const key = JSON.stringify([env[PROVIDER_ENV_VAR], env.AWS_REGION, env.AWS_DEFAULT_REGION, env.AWS_PROFILE]);
    if (!environmentProviders.has(key)) {
        environmentProviders.set(key, providerFromEnv(env));
    }
    return environmentProviders.get(key);
}
