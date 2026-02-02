/**
 * Local embedding support for voyage-4-nano model using Transformers.js
 */

import type * as VoyageAI from "../api";

let embedder: any = null;

async function getEmbedder() {
    if (!embedder) {
        try {
            const { pipeline } = await import("@xenova/transformers");
            embedder = await pipeline("feature-extraction", "voyageai/voyage-4-nano");
        } catch (e) {
            throw new Error(
                "Local model requires @xenova/transformers. Install: npm i @xenova/transformers"
            );
        }
    }
    return embedder;
}

export function isLocalModel(model: string): boolean {
    return model === "voyage-4-nano";
}

export async function localEmbed(request: VoyageAI.EmbedRequest): Promise<VoyageAI.EmbedResponse> {
    const model = await getEmbedder();
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const results = await model(inputs, { pooling: "mean", normalize: true });
    const dim = request.outputDimension ?? 1024;

    return {
        object: "list",
        model: "voyage-4-nano",
        data: inputs.map((_, idx) => ({
            object: "embedding",
            embedding: Array.from(results[idx].data).slice(0, dim) as number[],
            index: idx,
        })),
        usage: { totalTokens: inputs.reduce((sum, t) => sum + t.split(/\s+/).length, 0) },
    };
}
