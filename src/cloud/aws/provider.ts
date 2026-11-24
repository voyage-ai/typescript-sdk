/**
 * The AWS SageMaker provider: the single object the client talks to.
 *
 * Everything SageMaker-specific hangs off here — configuration, credentials, endpoint
 * discovery, SigV4 signing, and the container's response quirks — and the client sees only
 * `resolve(model)` returning a `Transport`.
 *
 * Configuration is parsed and validated eagerly at construction (so a typo fails there, not
 * on the first call), while the AWS SDK and the credential/discovery machinery are built
 * lazily on first `resolve` — importing this module, and constructing the provider, never
 * requires the AWS packages.
 *
 * This provider NEVER declines silently: a model it cannot place
 * raises a `ProviderResolutionError` (the client decides between API fallback and
 * propagation). A SageMaker user has deployed — and pays for — specific endpoints; a typo'd
 * `endpointMap` silently billing the hosted API instead would hide real misconfiguration.
 */

import type { AuthStrategy, Provider, Transport } from "../providers.js";
import { type AwsDeps, loadAwsDeps, type SageMakerSigner } from "./awsDeps.js";
import { parseSageMakerOptions, type SageMakerConfig, type SageMakerOptions } from "./config.js";
import { PRODUCT_MAP } from "./productMap.js";
import { SageMakerEndpointResolver } from "./resolver.js";
import { sageMakerResponseHandler } from "./responses.js";

// Standard partition only: no .com.cn / GovCloud URL formats.
function endpointBaseUrl(region: string, endpointName: string): string {
    return `https://runtime.sagemaker.${region}.amazonaws.com/endpoints/${endpointName}`;
}

/** Test seams; not part of the supported surface. */
export interface SageMakerProviderInternals {
    /** Replaces the lazy AWS SDK import with injected signer/discovery factories. */
    depsLoader?: () => Promise<AwsDeps>;
    /** Replaces the canonical Marketplace ProductId -> model table. */
    productMap?: Readonly<Record<string, string>>;
    /** Replaces `process.env` for config parsing (region fallback). */
    env?: Record<string, string | undefined>;
}

export class SageMakerProvider implements Provider {
    /** Provider alias, used in the API-fallback warning. */
    public readonly name: string = "aws";
    public readonly config: SageMakerConfig;

    private readonly depsLoader: () => Promise<AwsDeps>;
    private readonly productMap: Readonly<Record<string, string>>;
    private depsPromise: Promise<AwsDeps> | undefined;
    private signer: SageMakerSigner | undefined;
    private resolver: SageMakerEndpointResolver | undefined;

    constructor(options: SageMakerOptions = {}, internals: SageMakerProviderInternals = {}) {
        this.config = parseSageMakerOptions(
            options,
            internals.env ?? (typeof process !== "undefined" ? process.env : {}),
        );
        this.depsLoader = internals.depsLoader ?? loadAwsDeps;
        this.productMap = internals.productMap ?? PRODUCT_MAP;
    }

    /**
     * Resolve `model` to a transport for its endpoint, or throw a `ProviderResolutionError`.
     * Never returns `undefined`: a model this provider cannot place is an error the client
     * decides what to do with (API fallback, or propagate).
     */
    public async resolve(model: string): Promise<Transport> {
        const endpointName = await this.getResolver().then((resolver) => resolver.resolve(model));
        return {
            baseUrl: endpointBaseUrl(this.config.region, endpointName),
            path: "/invocations",
            auth: this.authStrategy(),
            responseHandler: sageMakerResponseHandler({
                model,
                endpointName,
                region: this.config.region,
            }),
        };
    }

    private async deps(): Promise<AwsDeps> {
        this.depsPromise ??= this.depsLoader();
        return this.depsPromise;
    }

    private async getResolver(): Promise<SageMakerEndpointResolver> {
        if (this.resolver === undefined) {
            const deps = await this.deps();
            this.resolver = new SageMakerEndpointResolver(
                this.config,
                deps.createDiscovery(this.config),
                this.productMap,
            );
        }
        return this.resolver;
    }

    private authStrategy(): AuthStrategy {
        return {
            buildHeaders: async (method, url, body, headers) => {
                if (this.signer === undefined) {
                    const deps = await this.deps();
                    this.signer = deps.createSigner(this.config);
                }
                return this.signer.sign({ method, url, headers, body: body ?? "" });
            },
        };
    }
}

/**
 * Build the SageMaker provider. Validation of `options` (region, credential combinations,
 * unknown keys) happens here, so misconfiguration throws at construction.
 *
 * @example
 *     import { VoyageAIClient, sagemakerProvider } from "voyageai";
 *
 *     const client = new VoyageAIClient({
 *         provider: sagemakerProvider({ region: "us-east-1" }),
 *     });
 */
export function sagemakerProvider(
    options: SageMakerOptions = {},
    internals?: SageMakerProviderInternals,
): SageMakerProvider {
    return new SageMakerProvider(options, internals);
}
