/**
 * getIdToToken must work with both tokenizer shapes:
 * @huggingface/transformers v3 (`tokenizer.model.vocab` array) and v4 (`get_vocab()` Map).
 * Uses fake tokenizers, so it needs neither network access nor the package.
 */
import { getIdToToken } from "../../src/local/tokenizer";

describe("getIdToToken", () => {
    test("reads the vocab array exposed by transformers v3", () => {
        const tokenizer = { model: { vocab: ["a", "b", "Ġc"] } };
        const lookup = getIdToToken(tokenizer);

        expect(lookup(0)).toBe("a");
        expect(lookup(2)).toBe("Ġc");
        expect(lookup(3)).toBeUndefined();
    });

    test("inverts get_vocab() when tokenizer.model is missing (transformers v4)", () => {
        const getVocab = vi.fn(
            () =>
                new Map([
                    ["hello", 14990],
                    ["Ġworld", 1879],
                ]),
        );
        const tokenizer = { get_vocab: getVocab };
        const lookup = getIdToToken(tokenizer);

        expect(lookup(14990)).toBe("hello");
        expect(lookup(1879)).toBe("Ġworld");
        expect(lookup(1)).toBeUndefined();
    });

    test("caches the lookup per tokenizer", () => {
        const getVocab = vi.fn(() => new Map([["x", 0]]));
        const tokenizer = { get_vocab: getVocab };

        expect(getIdToToken(tokenizer)).toBe(getIdToToken(tokenizer));
        expect(getVocab).toHaveBeenCalledTimes(1);
    });
});
