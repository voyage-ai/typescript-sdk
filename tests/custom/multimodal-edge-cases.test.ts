import { VoyageAIClient as Client } from "../../src/Client";
import { VoyageAIError } from "../../src/errors";
import { loadImageBase64, loadVideoBase64 } from "./helpers";

const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });

describe("multimodalEmbed() edge cases", () => {
    // --- Text-only ---

    test("text-only content", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                { content: [{ type: "text", text: "Hello world" }] },
            ],
            model: "voyage-multimodal-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    test("multiple text-only inputs (batch)", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                { content: [{ type: "text", text: "First text" }] },
                { content: [{ type: "text", text: "Second text" }] },
                { content: [{ type: "text", text: "Third text" }] },
            ],
            model: "voyage-multimodal-3",
        });
        expect(result.data?.length).toBe(3);
    });

    // --- Image-only ---

    test("image URL only", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                { content: [{ type: "image_url", imageUrl: "https://www.voyageai.com/feature.png" }] },
            ],
            model: "voyage-multimodal-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    test("image base64 only", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                { content: [{ type: "image_base64", imageBase64: loadImageBase64() }] },
            ],
            model: "voyage-multimodal-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    // --- Mixed ---

    test("mixed text + image in one input", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                {
                    content: [
                        { type: "text", text: "A description of an image" },
                        { type: "image_url", imageUrl: "https://www.voyageai.com/feature.png" },
                    ],
                },
            ],
            model: "voyage-multimodal-3",
        });
        expect(result.data?.length).toBe(1);
    });

    test("multiple content items compose to single embedding", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                {
                    content: [
                        { type: "text", text: "First part." },
                        { type: "text", text: "Second part." },
                        { type: "text", text: "Third part." },
                    ],
                },
            ],
            model: "voyage-multimodal-3",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    });

    // --- inputType ---

    test("inputType query succeeds", async () => {
        const result = await client.multimodalEmbed({
            inputs: [{ content: [{ type: "text", text: "search query" }] }],
            model: "voyage-multimodal-3",
            inputType: "query",
        });
        expect(result.data?.length).toBe(1);
    });

    test("inputType document succeeds", async () => {
        const result = await client.multimodalEmbed({
            inputs: [{ content: [{ type: "text", text: "a document" }] }],
            model: "voyage-multimodal-3",
            inputType: "document",
        });
        expect(result.data?.length).toBe(1);
    });

    // --- encodingFormat ---

    test("encodingFormat base64 returns embeddings", async () => {
        const result = await client.multimodalEmbed({
            inputs: [{ content: [{ type: "text", text: "hello" }] }],
            model: "voyage-multimodal-3",
            encodingFormat: "base64",
        });
        expect(result.data?.length).toBe(1);
        const embedding = result.data![0].embedding;
        expect(typeof embedding === "string" || Array.isArray(embedding)).toBe(true);
    });

    // --- Error cases ---

    test("empty inputs array throws error", async () => {
        await expect(
            client.multimodalEmbed({ inputs: [], model: "voyage-multimodal-3" })
        ).rejects.toThrow(VoyageAIError);
    });

    test("empty content array throws error", async () => {
        await expect(
            client.multimodalEmbed({
                inputs: [{ content: [] }],
                model: "voyage-multimodal-3",
            })
        ).rejects.toThrow(VoyageAIError);
    });

    // --- Model variants ---

    test("voyage-multimodal-3.5 with text-only", async () => {
        const result = await client.multimodalEmbed({
            inputs: [{ content: [{ type: "text", text: "test" }] }],
            model: "voyage-multimodal-3.5",
        });
        expect(result.model).toBe("voyage-multimodal-3.5");
        expect(result.data?.length).toBe(1);
    });

    // --- Video (voyage-multimodal-3.5) ---

    test("video URL with voyage-multimodal-3.5", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                {
                    content: [
                        { type: "text", text: "A sample video" },
                        { type: "video_url", videoUrl: "https://download.samplelib.com/mp4/sample-5s.mp4" },
                    ],
                },
            ],
            model: "voyage-multimodal-3.5",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    }, 60000);

    test("video base64 with voyage-multimodal-3.5", async () => {
        const result = await client.multimodalEmbed({
            inputs: [
                {
                    content: [
                        { type: "text", text: "A sample video" },
                        { type: "video_base64", videoBase64: loadVideoBase64() },
                    ],
                },
            ],
            model: "voyage-multimodal-3.5",
        });
        expect(result.data?.length).toBe(1);
        expect(result.data![0].embedding!.length).toBeGreaterThan(0);
    }, 60000);

    // --- Response structure ---

    test("response has correct structure", async () => {
        const result = await client.multimodalEmbed({
            inputs: [{ content: [{ type: "text", text: "hello" }] }],
            model: "voyage-multimodal-3",
        });
        expect(result.object).toBe("list");
        expect(result.model).toBe("voyage-multimodal-3");
        expect(result.usage).toBeDefined();
        expect(typeof result.usage!.totalTokens).toBe("number");
        expect(result.data![0].object).toBe("embedding");
        expect(typeof result.data![0].index).toBe("number");
        expect(Array.isArray(result.data![0].embedding)).toBe(true);
    });
});
