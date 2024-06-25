import { VoyageAIClient } from "../../src";

describe("Test Client", () => {
    
    it("Test Embed", async () => {
        const client = new VoyageAIClient({
            apiKey: process.env.ENV_API_KEY ?? "",
            environment: process.env.TESTS_BASE_URL ?? ""
        });
        const response = await client.embed({
            "input": [
              "Sample text 1",
              "Sample text 2"
            ],
            "model": "voyage-large-2"
        });
        expect(response).toBeTruthy();
    });

    it("Test Rerank", async () => {
        const client = new VoyageAIClient({
            apiKey: process.env.ENV_API_KEY ?? "",
            environment: process.env.TESTS_BASE_URL ?? ""
        });
        const response = await client.rerank({
            "query": "Sample query",
            "documents": [
              "Sample document 1",
              "Sample document 2"
            ],
            "model": "rerank-lite-1"
        });
        expect(response).toBeTruthy();
    });
});