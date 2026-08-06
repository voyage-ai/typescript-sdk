/**
 * SageMaker runtime: endpoint resolution + SigV4-signed invocation over the SDK's
 * existing fetch machinery (spec §8, §9, §10).
 *
 * One instance per client. The AWS deps (signer + discovery) are loaded lazily on first
 * use and reused thereafter — the botocore-session equivalent. Successful resolutions
 * are cached inside the resolver.
 */

import type { RawResponse } from "../core/fetcher/RawResponse.js";
import * as core from "../core/index.js";
import { VoyageAIError } from "../errors/VoyageAIError.js";
import { VoyageAITimeoutError } from "../errors/VoyageAITimeoutError.js";
import { SDK_VERSION } from "../version.js";
import { type AwsDeps, loadAwsDeps, type SageMakerSigner } from "./awsDeps.js";
import type { SageMakerConfig } from "./config.js";
import { mapSageMakerError } from "./errors.js";
import { PRODUCT_MAP } from "./productMap.js";
import { SageMakerEndpointResolver } from "./resolver.js";

/** Result of a SageMaker invocation: the parsed JSON body and the raw HTTP response. */
export interface SageMakerInvokeResult {
    body: unknown;
    rawResponse: RawResponse;
}

/** Per-call transport options threaded through from the client's RequestOptions. */
export interface SageMakerRequestOptions {
    timeoutInSeconds?: number;
    maxRetries?: number;
    abortSignal?: AbortSignal;
    fetch?: typeof fetch;
    logging?: core.logging.LogConfig | core.logging.Logger;
}

function runtimeUrl(region: string, endpointName: string): string {
    // Standard partition only (spec NG6): no .com.cn / GovCloud URL formats.
    return `https://runtime.sagemaker.${region}.amazonaws.com/endpoints/${endpointName}/invocations`;
}

export class SageMakerRuntime {
    public readonly config: SageMakerConfig;
    public readonly hasApiKey: boolean;

    private readonly depsLoader: () => Promise<AwsDeps>;
    private readonly productMap: Readonly<Record<string, string>>;
    private depsPromise: Promise<AwsDeps> | undefined;
    private signer: SageMakerSigner | undefined;
    private resolver: SageMakerEndpointResolver | undefined;
    private readonly warnedModels: Set<string> = new Set();

    constructor(
        config: SageMakerConfig,
        opts: {
            hasApiKey: boolean;
            depsLoader?: () => Promise<AwsDeps>;
            productMap?: Readonly<Record<string, string>>;
        },
    ) {
        this.config = config;
        this.hasApiKey = opts.hasApiKey;
        this.depsLoader = opts.depsLoader ?? loadAwsDeps;
        this.productMap = opts.productMap ?? PRODUCT_MAP;
    }

    private async deps(): Promise<AwsDeps> {
        if (this.depsPromise === undefined) {
            this.depsPromise = this.depsLoader();
        }
        return this.depsPromise;
    }

    /** Resolve a model to its endpoint name (throws a resolution / auth error on failure). */
    public async resolveEndpoint(model: string): Promise<string> {
        if (this.resolver === undefined) {
            const deps = await this.deps();
            this.resolver = new SageMakerEndpointResolver(
                this.config,
                deps.createDiscovery(this.config),
                this.productMap,
            );
        }
        return this.resolver.resolve(model);
    }

    /** Emit the API-fallback warning at most once per model (spec R3). */
    public warnOnce(model: string, reason: string): void {
        if (this.warnedModels.has(model)) {
            return;
        }
        this.warnedModels.add(model);
        // eslint-disable-next-line no-console
        console.warn(
            `Model '${model}' could not be resolved to a SageMaker endpoint (${reason}); ` +
                "falling back to the Voyage API.",
        );
    }

    /**
     * Sign `bodyString` and POST it to the endpoint's `/invocations` URL, returning the
     * parsed response. Endpoint resolution must have happened already (outside the retry
     * loop). Retries are handled by the shared fetcher via `maxRetries`.
     */
    public async invoke(
        endpointName: string,
        bodyString: string,
        requestOptions?: SageMakerRequestOptions,
    ): Promise<SageMakerInvokeResult> {
        if (this.signer === undefined) {
            const deps = await this.deps();
            this.signer = deps.createSigner(this.config);
        }

        const url = runtimeUrl(this.config.region, endpointName);
        const baseHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": `voyageai/${SDK_VERSION}`,
        };
        const signedHeaders = await this.signer.sign({ method: "POST", url, headers: baseHeaders, body: bodyString });
        // Let the fetch layer set Host itself (it is a forbidden request header for fetch,
        // and undici derives it from the URL — the SigV4 signature stays valid because AWS
        // recomputes the canonical request from the Host it actually receives).
        delete signedHeaders.host;
        delete signedHeaders.Host;

        const response = await core.fetcher({
            url,
            method: "POST",
            headers: signedHeaders,
            contentType: "application/json",
            body: bodyString,
            requestType: "other",
            responseType: "json",
            timeoutMs: (requestOptions?.timeoutInSeconds ?? 60) * 1000,
            maxRetries: requestOptions?.maxRetries,
            abortSignal: requestOptions?.abortSignal,
            fetchFn: requestOptions?.fetch,
            logging: requestOptions?.logging,
        });

        if (response.ok) {
            return { body: response.body, rawResponse: response.rawResponse };
        }

        if (response.error.reason === "status-code") {
            throw mapSageMakerError({
                endpointName,
                region: this.config.region,
                statusCode: response.error.statusCode,
                body: response.error.body,
                rawResponse: response.rawResponse,
            });
        }
        if (response.error.reason === "non-json") {
            throw mapSageMakerError({
                endpointName,
                region: this.config.region,
                statusCode: response.error.statusCode,
                body: response.error.rawBody,
                rawResponse: response.rawResponse,
            });
        }
        if (response.error.reason === "timeout") {
            throw new VoyageAITimeoutError(
                `Timeout invoking SageMaker endpoint '${endpointName}' in region '${this.config.region}'.`,
            );
        }
        throw new VoyageAIError({
            message:
                response.error.reason === "unknown"
                    ? `SageMaker request failed (endpoint '${endpointName}', region '${this.config.region}'): ${response.error.errorMessage}`
                    : `SageMaker request failed (endpoint '${endpointName}', region '${this.config.region}').`,
            rawResponse: response.rawResponse,
        });
    }
}
