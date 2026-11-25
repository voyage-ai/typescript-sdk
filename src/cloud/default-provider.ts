/**
 * Ambient provider configuration: how code that creates its own `VoyageAIClient` — LangChain,
 * LlamaIndex and other integrations — reaches a cloud provider without being changed.
 *
 * A client constructed without a `provider` option uses, in order:
 *  1. the process-wide default set with {@link setDefaultProvider} (one line at application startup);
 *  2. the provider named by the `VOYAGE_CLOUD_PROVIDER` environment variable (no code at all);
 *  3. the Voyage API.
 * An explicit `provider` option always wins, and `provider: null` pins a client to the Voyage API.
 * The provider is picked when the client is constructed, so a misconfiguration (say,
 * `VOYAGE_CLOUD_PROVIDER=aws` without a region) fails there, and changing the default later does
 * not affect clients that already exist.
 *
 * `VOYAGE_CLOUD_PROVIDER` values are shared with the Python SDK: `voyage` (the Voyage API) and `aws`
 * (SageMaker, configured from the standard AWS environment: region from `AWS_REGION` /
 * `AWS_DEFAULT_REGION`, credentials from the default chain including `AWS_PROFILE`, endpoints found
 * by discovery). `azure` and `gcp` are reserved.
 */

import { SageMakerProvider } from "./aws/provider.js";
import type { Provider } from "./providers.js";

/** Environment variable that selects a provider for clients created without one. */
export const PROVIDER_ENV_VAR = "VOYAGE_CLOUD_PROVIDER";

type EnvLike = Record<string, string | undefined>;

/** Provider aliases reserved for clouds this version does not support yet. */
const RESERVED_ALIASES: readonly string[] = ["azure", "gcp"];

interface AmbientState {
    /** Whether {@link setDefaultProvider} pinned a default (a provider, or the Voyage API). */
    defaultSet: boolean;
    defaultProvider: Provider | undefined;
    /** Providers built from the environment, keyed by the variables they were built from. */
    envProviders: Map<string, Provider | undefined>;
}

/**
 * The state lives on `globalThis` under a registered symbol, so the CommonJS and ESM builds of
 * this package — which an application and an integration may load side by side — share one default.
 */
const STATE_KEY = Symbol.for("voyageai.ambientProvider");

function ambientState(): AmbientState {
    const holder = globalThis as unknown as Record<symbol, AmbientState | undefined>;
    let state = holder[STATE_KEY];
    if (state === undefined) {
        state = { defaultSet: false, defaultProvider: undefined, envProviders: new Map() };
        holder[STATE_KEY] = state;
    }
    return state;
}

function processEnv(): EnvLike {
    return typeof process !== "undefined" ? process.env : {};
}

/**
 * Build the provider named by `VOYAGE_CLOUD_PROVIDER`, or `undefined` for the Voyage API (variable
 * unset, empty, or `voyage`). Throws for reserved or unknown values, and when the named provider
 * is misconfigured.
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

/**
 * {@link providerFromEnv}, reusing the provider built for the same settings, so every client in the
 * process shares one endpoint-discovery cache and one credential provider.
 */
function sharedProviderFromEnv(env: EnvLike): Provider | undefined {
    const key = JSON.stringify([env[PROVIDER_ENV_VAR], env.AWS_REGION, env.AWS_DEFAULT_REGION, env.AWS_PROFILE]);
    const providers = ambientState().envProviders;
    if (!providers.has(key)) {
        providers.set(key, providerFromEnv(env));
    }
    return providers.get(key);
}

/**
 * Set the provider used by every `VoyageAIClient` constructed afterwards without a `provider`
 * option, including clients that integrations create internally.
 *
 * @param provider - A provider (e.g. `sagemakerProvider({ region })`); `null` to pin new clients to
 *     the Voyage API whatever `VOYAGE_CLOUD_PROVIDER` says; `undefined` to clear the default and
 *     follow `VOYAGE_CLOUD_PROVIDER` again.
 *
 * @example
 *     // At application startup, before integrations create their clients:
 *     setDefaultProvider(sagemakerProvider({ region: "us-east-1" }));
 */
export function setDefaultProvider(provider: Provider | null | undefined): void {
    const state = ambientState();
    state.defaultSet = provider !== undefined;
    state.defaultProvider = provider ?? undefined;
}

/**
 * The provider a client constructed now without a `provider` option would use, or `undefined` for
 * the Voyage API: the {@link setDefaultProvider} default, else `VOYAGE_CLOUD_PROVIDER`.
 */
export function getDefaultProvider(env: EnvLike = processEnv()): Provider | undefined {
    const state = ambientState();
    return state.defaultSet ? state.defaultProvider : sharedProviderFromEnv(env);
}
