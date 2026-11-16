/**
 * Shared tokenizer utility for all Voyage models (local and API).
 * Loads tokenizers from HuggingFace Hub via @huggingface/transformers.
 */

/** HuggingFace Hub organization hosting the Voyage tokenizers. */
const TOKENIZER_HF_ORG = "MongoDB";

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
        tokenizer = await AutoTokenizer.from_pretrained(`${TOKENIZER_HF_ORG}/${model}`);
        tokenizerCache.set(model, tokenizer);
    }
    return tokenizer;
}

const idToTokenCache = new WeakMap<object, (id: number) => string | undefined>();

/**
 * Returns a lookup from token id to token string.
 * @huggingface/transformers v3 exposes the vocabulary as an array on `tokenizer.model.vocab`;
 * v4 removed `tokenizer.model` and provides `get_vocab()` (token -> id Map) instead.
 */
export function getIdToToken(tokenizer: any): (id: number) => string | undefined {
    let lookup = idToTokenCache.get(tokenizer);
    if (!lookup) {
        const vocab = tokenizer.model?.vocab;
        if (vocab != null) {
            lookup = (id) => vocab[id];
        } else {
            const inverse = new Map<number, string>();
            for (const [token, id] of tokenizer.get_vocab() as Map<string, number>) {
                inverse.set(id, token);
            }
            lookup = (id) => inverse.get(id);
        }
        idToTokenCache.set(tokenizer, lookup);
    }
    return lookup;
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
    const idToToken = getIdToToken(tokenizer);
    const results: TokenizeResult[] = [];

    for (const text of texts) {
        const encoded = tokenizer(text);
        const ids: number[] = Array.from(encoded.input_ids.data, (v: any) => Number(v));
        const tokens: string[] = ids.map((id: number) => idToToken(id) ?? `<unk:${id}>`);
        results.push({ tokens, ids });
    }

    return results;
}
