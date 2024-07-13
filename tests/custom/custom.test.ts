import { VoyageAIClient as Client } from "../../src/Client";
import { FetchFunction, Fetcher } from "../../src/core/fetcher/Fetcher";
import { VoyageAIError, VoyageAITimeoutError } from "../../src/errors";

const documents = [
    "The Mediterranean diet emphasizes fish, olive oil, and vegetables, believed to reduce chronic diseases.",
    "Photosynthesis in plants converts light energy into glucose and produces essential oxygen.",
    "20th-century innovations, from radios to smartphones, centered on electronic advancements.",
    "Rivers provide water, irrigation, and habitat for aquatic species, vital for ecosystems.",
    "Apple’s conference call to discuss fourth fiscal quarter results and business updates is scheduled for Thursday, November 2, 2023 at 2:00 p.m. PT / 5:00 p.m. ET.",
    "Shakespeare's works, like 'Hamlet' and 'A Midsummer Night's Dream,' endure in literature.",
];

describe("Client full integration tests", () => {
    test("Embeddings - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.embed({ input: documents, model: "voyage-large-2" });
        expect(result.model).toBe("voyage-large-2");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Reranking - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.rerank({
            query: "When is the Apple's conference call scheduled?",
            documents: documents,
            model: "rerank-1",
        });
        expect(result.model).toBe("rerank-1");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Embeddings - happy path++", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.embed(
            { input: documents, model: "voyage-large-2" },
            { timeoutInSeconds: 1, maxRetries: 1, abortSignal: {dispatchEvent: (event: Event) => {return true}, removeEventListener: () => {}, addEventListener: () => {}, onabort: null, aborted: false} }

        );
        expect(result.model).toBe("voyage-large-2");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Reranking - happy path++", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.rerank(
            { query: "When is the Apple's conference call scheduled?", documents: documents, model: "rerank-1" },
            { timeoutInSeconds: 1, maxRetries: 1, abortSignal: {dispatchEvent: (event: Event) => {return true}, removeEventListener: () => {}, addEventListener: () => {}, onabort: null, aborted: false} }
        );
        expect(result.model).toBe("rerank-1");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Embeddings - auth error", async () => {
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key" });
            await client.embed({
                input: documents,
                model: "voyage-large-2",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Reranking - auth error", async () => {
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key" });
            await client.rerank({
                query: "When is the Apple's conference call scheduled?",
                documents: documents,
                model: "rerank-1",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Embeddings - NonJson error", async () => {
        const errorFetcher: FetchFunction = async (args: Fetcher.Args) => {
            return {
                ok: false,
                error: {
                    reason: "non-json",
                    statusCode: 401,
                    rawBody: "raw non-json body",
                },
            };
        };
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key", fetcher: errorFetcher });
            await client.embed({
                input: documents,
                model: "voyage-large-2",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Reranking - NonJson error", async () => {
        const errorFetcher: FetchFunction = async (args: Fetcher.Args) => {
            return {
                ok: false,
                error: {
                    reason: "non-json",
                    statusCode: 401,
                    rawBody: "raw non-json body",
                },
            };
        };
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key", fetcher: errorFetcher });
            await client.rerank({
                query: "When is the Apple's conference call scheduled?",
                documents: documents,
                model: "rerank-1",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Embeddings - Timeout error", async () => {
        const errorFetcher: FetchFunction = async (args: Fetcher.Args) => {
            return {
                ok: false,
                error: {
                    reason: "timeout",
                },
            };
        };
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key", fetcher: errorFetcher });
            await client.embed({
                input: documents,
                model: "voyage-large-2",
            });
        }).rejects.toThrow(VoyageAITimeoutError);
    });

    test("Reranking - Timeout error", async () => {
        const errorFetcher: FetchFunction = async (args: Fetcher.Args) => {
            return {
                ok: false,
                error: {
                    reason: "timeout",
                },
            };
        };
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key", fetcher: errorFetcher });
            await client.rerank({
                query: "When is the Apple's conference call scheduled?",
                documents: documents,
                model: "rerank-1",
            });
        }).rejects.toThrow(VoyageAITimeoutError);
    });

    test("Embeddings - Unknown error", async () => {
        const errorFetcher: FetchFunction = async (args: Fetcher.Args) => {
            return {
                ok: false,
                error: {
                    reason: "unknown",
                    errorMessage: "Unknown error occured",
                },
            };
        };
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key", fetcher: errorFetcher });
            await client.embed({
                input: documents,
                model: "voyage-large-2",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Reranking - Unknown error", async () => {
        const errorFetcher: FetchFunction = async (args: Fetcher.Args) => {
            return {
                ok: false,
                error: {
                    reason: "unknown",
                    errorMessage: "Unknown error occured",
                },
            };
        };
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key", fetcher: errorFetcher });
            await client.rerank({
                query: "When is the Apple's conference call scheduled?",
                documents: documents,
                model: "rerank-1",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Embedding - no auth header", async () => {
        await expect(async () => {
            delete process.env.VOYAGE_API_KEY;
            const client = new Client();
            await client.embed({
                input: documents,
                model: "voyage-large-2",
            });
        }).rejects.toThrow(VoyageAIError);
    });
});
