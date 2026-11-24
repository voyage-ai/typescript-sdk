/**
 * SageMaker response handling: normalize success bodies to the exact Voyage API envelope and
 * re-express failures as Voyage API error responses.
 *
 * The handler is built per resolved model, so the model name decides which normalization
 * applies — a Voyage model determines its operation family (rerank-* models only rerank,
 * voyage-context-* models only contextualize, voyage-multimodal-* models only serve
 * multimodal embeddings, everything else embeds).
 */

import {
    CONTEXTUALIZED_RESPONSE_KEYS,
    normalizeEmbeddingBody,
    RERANK_RESPONSE_KEYS,
    stripUnknownTopLevelKeys,
} from "../normalize.js";
import type { ProviderResponseHandler } from "../providers.js";
import { mapSageMakerError } from "./errors.js";

type ModelFamily = "rerank" | "contextualized" | "multimodal" | "embed";

function modelFamily(model: string): ModelFamily {
    const name = model.toLowerCase();
    if (name.startsWith("rerank")) {
        return "rerank";
    }
    if (name.includes("context")) {
        return "contextualized";
    }
    if (name.includes("multimodal")) {
        return "multimodal";
    }
    return "embed";
}

function normalizeSuccessBody(family: ModelFamily, body: unknown): unknown {
    switch (family) {
        case "rerank":
            return stripUnknownTopLevelKeys(body, RERANK_RESPONSE_KEYS);
        case "contextualized":
            return stripUnknownTopLevelKeys(body, CONTEXTUALIZED_RESPONSE_KEYS);
        case "multimodal":
            return normalizeEmbeddingBody(body, true);
        default:
            return normalizeEmbeddingBody(body, false);
    }
}

/** Build the transport response handler for one resolved model/endpoint pair. */
export function sageMakerResponseHandler(args: {
    model: string;
    endpointName: string;
    region: string;
}): ProviderResponseHandler {
    const family = modelFamily(args.model);
    return (status, body, headers) => {
        if (status >= 200 && status < 300) {
            return { status, body: normalizeSuccessBody(family, body) };
        }
        return mapSageMakerError({
            endpointName: args.endpointName,
            region: args.region,
            statusCode: status,
            body,
            headers,
        });
    };
}
