import { VoyageAIClient } from "../../src/Client";
import { VoyageAIClient as ExtendedClient } from "../../src/extended/ExtendedClient";
import { mockServerPool } from "../mock-server/MockServerPool";

describe("auto-chunking wire tests", () => {
    test("auto-chunking fields serialize to snake_case and response deserializes to camelCase", async () => {
        const server = mockServerPool.createServer();
        const client = new VoyageAIClient({ maxRetries: 0, apiKey: "test", environment: server.baseUrl });
        const rawRequestBody = {
            inputs: [["doc text"]],
            model: "voyage-context-3",
            input_type: "document",
            enable_auto_chunking: true,
            chunk_size: 512,
            chunk_overlap: 64,
        };
        const rawResponseBody = {
            object: "list",
            data: [
                {
                    object: "list",
                    data: [
                        { object: "embedding", embedding: [0.1, 0.2], index: 0, text: "doc text part 1" },
                        { object: "embedding", embedding: [0.3, 0.4], index: 1, text: "doc text part 2" },
                    ],
                    index: 0,
                },
            ],
            model: "voyage-context-3",
            usage: { total_tokens: 10 },
            chunker_version: "v1.0",
        };
        server
            .mockEndpoint()
            .post("/contextualizedembeddings")
            .jsonBody(rawRequestBody)
            .respondWith()
            .statusCode(200)
            .jsonBody(rawResponseBody)
            .build();

        const response = await client.contextualizedEmbed({
            inputs: [["doc text"]],
            model: "voyage-context-3",
            inputType: "document",
            enableAutoChunking: true,
            chunkSize: 512,
            chunkOverlap: 64,
        });
        expect(response).toEqual({
            object: "list",
            data: [
                {
                    object: "list",
                    data: [
                        { object: "embedding", embedding: [0.1, 0.2], index: 0, text: "doc text part 1" },
                        { object: "embedding", embedding: [0.3, 0.4], index: 1, text: "doc text part 2" },
                    ],
                    index: 0,
                },
            ],
            model: "voyage-context-3",
            usage: {
                totalTokens: 10,
            },
            chunkerVersion: "v1.0",
        });
    });

    test("response without auto-chunking fields omits chunkerVersion and text", async () => {
        const server = mockServerPool.createServer();
        const client = new VoyageAIClient({ maxRetries: 0, apiKey: "test", environment: server.baseUrl });
        const rawRequestBody = { inputs: [["chunk"]], model: "model" };
        const rawResponseBody = {
            object: "list",
            data: [{ object: "list", data: [{ object: "embedding", embedding: [1.0], index: 0 }], index: 0 }],
            model: "model",
            usage: { total_tokens: 5 },
        };
        server
            .mockEndpoint()
            .post("/contextualizedembeddings")
            .jsonBody(rawRequestBody)
            .respondWith()
            .statusCode(200)
            .jsonBody(rawResponseBody)
            .build();

        const response = await client.contextualizedEmbed({
            inputs: [["chunk"]],
            model: "model",
        });
        expect(response.chunkerVersion).toBeUndefined();
        expect(response.data![0].data![0].text).toBeUndefined();
    });

    test("chunkFn sends chunked inputs to API", async () => {
        const server = mockServerPool.createServer();
        const client = new ExtendedClient({ maxRetries: 0, apiKey: "test", environment: server.baseUrl });
        const rawRequestBody = {
            inputs: [["Hello ", "world"]],
            model: "model",
        };
        const rawResponseBody = {
            object: "list",
            data: [
                {
                    object: "list",
                    data: [
                        { object: "embedding", embedding: [0.1], index: 0 },
                        { object: "embedding", embedding: [0.2], index: 1 },
                    ],
                    index: 0,
                },
            ],
            model: "model",
            usage: { total_tokens: 5 },
        };
        server
            .mockEndpoint()
            .post("/contextualizedembeddings")
            .jsonBody(rawRequestBody)
            .respondWith()
            .statusCode(200)
            .jsonBody(rawResponseBody)
            .build();

        const result = await client.contextualizedEmbed({
            inputs: [["Hello world"]],
            model: "model",
            chunkFn: (text) => text.split(/(?<= )/),
        });
        expect(result.results.length).toBe(1);
        expect(result.results[0].embeddings.length).toBe(2);
        expect(result.chunkTexts).toEqual([["Hello ", "world"]]);
    });
});
