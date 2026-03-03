/**
 * Shared tokenizer utility for all Voyage models (local and API).
 * Loads tokenizers from HuggingFace Hub via @huggingface/transformers.
 */

const tokenizerCache = new Map<string, any>();

let transformersModule: any = null;

export async function getTransformers(): Promise<any> {
    if (!transformersModule) {
        try {
            transformersModule = await import("@huggingface/transformers");
        } catch {
            throw new Error(
                "Tokenizer requires @huggingface/transformers. " +
                    "Install: npm i @huggingface/transformers onnxruntime-node"
            );
        }
    }
    return transformersModule;
}

/** Load tokenizer for any Voyage model (cached). */
export async function getTokenizerForModel(model: string): Promise<any> {
    let tokenizer = tokenizerCache.get(model);
    if (!tokenizer) {
        const { AutoTokenizer } = await getTransformers();
        tokenizer = await AutoTokenizer.from_pretrained(`voyageai/${model}`);
        tokenizerCache.set(model, tokenizer);
    }
    return tokenizer;
}

export interface TokenizeResult {
    tokens: string[];
    ids: number[];
}

/** Tokenize texts using the model's tokenizer. */
export async function tokenizeTexts(model: string, texts: string[]): Promise<TokenizeResult[]> {
    if (texts.length === 0) {
        return [];
    }

    const tokenizer = await getTokenizerForModel(model);
    const results: TokenizeResult[] = [];

    for (const text of texts) {
        const encoded = tokenizer(text);
        const ids: number[] = Array.from(encoded.input_ids.data, (v: any) => Number(v));
        const tokens: string[] = ids.map((id: number) => tokenizer.model.vocab[id] ?? `<unk:${id}>`);
        results.push({ tokens, ids });
    }

    return results;
}
