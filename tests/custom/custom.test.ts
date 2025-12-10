import * as fs from "fs";
import * as path from "path";
import { VoyageAIClient as Client } from "../../src/Client";
import { FetchFunction, Fetcher } from "../../src/core/fetcher/Fetcher";
import { VoyageAIError, VoyageAITimeoutError } from "../../src/errors";
import { MultimodalEmbedRequestInputsItem } from "../../src/serialization";

const documents = [
    "The Mediterranean diet emphasizes fish, olive oil, and vegetables, believed to reduce chronic diseases.",
    "Photosynthesis in plants converts light energy into glucose and produces essential oxygen.",
    "20th-century innovations, from radios to smartphones, centered on electronic advancements.",
    "Rivers provide water, irrigation, and habitat for aquatic species, vital for ecosystems.",
    "Apple’s conference call to discuss fourth fiscal quarter results and business updates is scheduled for Thursday, November 2, 2023 at 2:00 p.m. PT / 5:00 p.m. ET.",
    "Shakespeare's works, like 'Hamlet' and 'A Midsummer Night's Dream,' endure in literature.",
];

// Helper function to load image as base64
const loadImageBase64 = (): string => {
    const imagePath = path.join(__dirname, "example_image_01.jpg");
    const imageBuffer = fs.readFileSync(imagePath);
    return "data:image/jpeg;base64," + imageBuffer.toString("base64");
};

// Helper function to load video as base64
const loadVideoBase64 = (): string => {
    const videoPath = path.join(__dirname, "example_video_01.mp4");
    const videoBuffer = fs.readFileSync(videoPath);
    return "data:video/mp4;base64," + videoBuffer.toString("base64");
};

const multimodal_inputs = [
    {
        content: [
            {
                type: "text",
                text: "The Mediterranean diet emphasizes fish, olive oil, and vegetables, believed to reduce chronic diseases.",
            },
            {
                type: "image_url",
                imageUrl: "https://www.voyageai.com/feature.png",
            },
            {
                type: "image_base64",
                imageBase64: loadImageBase64(),
            },
        ]
    },
    {
        content: [
            {
                type: "text",
                text: "The Mediterranean diet emphasizes fish, olive oil, and vegetables, believed to reduce chronic diseases.",
            },
            {
                type: "image_url",
                imageUrl: "https://www.voyageai.com/feature.png",
            },
        ]
    }
];


const contextualized_inputs = [
    [
        "The Mediterranean diet emphasizes fish, olive oil, and vegetables, believed to reduce chronic diseases.",
        "The Mediterranean diet is a way of eating based on the traditional cuisines of countries bordering the Mediterranean Sea. It emphasizes plant-based foods, healthy fats, and moderate amounts of dairy, poultry, and seafood, while limiting red meat and processed foods. The diet is known for its potential health benefits, including heart health, weight management, and cognitive function. "
    ],
    [
        "The Warrior Diet is a weight-loss diet that involves a rather extreme form of intermittent fasting. This eating plan mimics the pattern of ancient warriors and is designed to aid weight loss and improve the body's 'survival instincts.' The Warrior diet encourages 20 hours a day of undereating, followed by a four-hour window of overeating. This window doesn't have specific calorie targets or limits.",
        "The Warrior Diet is an intermittent fasting method that doesn't require fasting completely. You eat very little for 20 hours a day and then eat as much food as you like during a four-hour evening window. This window has no specific calorie targets or limits.",
        "The Warrior Diet is split into three weeks, or 'phases'. You can repeat this process, continuing to do so until you meet your goals after completing the three phases."
    ]
];

// Video inputs for voyage-multimodal-3.5 testing
const video_url_inputs = [
    {
        content: [
            {
                type: "text",
                text: "A sample video for testing video embeddings.",
            },
            {
                type: "video_url",
                videoUrl: "https://download.samplelib.com/mp4/sample-5s.mp4",
            },
        ]
    }
];

const video_base64_inputs = [
    {
        content: [
            {
                type: "text",
                text: "A sample video for testing video embeddings with base64.",
            },
            {
                type: "video_base64",
                videoBase64: loadVideoBase64(),
            },
        ]
    }
];


describe("Client full integration tests", () => {
    test("Embeddings - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.embed({ input: documents, model: "voyage-3-large" });
        expect(result.model).toBe("voyage-3-large");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Embeddings - happy path, output_dimension", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.embed({ input: documents, model: "voyage-3-large", outputDimension: 2048 });
        expect(result.model).toBe("voyage-3-large");
        expect(result.data?.length).toBe(documents.length);
        expect(result.data?.[0].embedding?.length).toBe(2048);
    });

    test("Embeddings - happy path, output_dimension & output_dtype", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.embed({ input: documents, model: "voyage-3-large", outputDimension: 2048, outputDtype: "binary" });
        expect(result.model).toBe("voyage-3-large");
        expect(result.data?.length).toBe(documents.length);
        expect(result.data?.[0].embedding?.length).toBe(256);
    });

    test("Reranking - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.rerank({
            query: "When is the Apple's conference call scheduled?",
            documents: documents,
            model: "rerank-2",
        });
        expect(result.model).toBe("rerank-2");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Multimodal embeddings - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.multimodalEmbed({ inputs: multimodal_inputs, model: "voyage-multimodal-3" });
        expect(result.model).toBe("voyage-multimodal-3");
        expect(result.data?.length).toBe(multimodal_inputs.length);
    });    


    test("Multimodal video embeddings with video_url - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.multimodalEmbed({ inputs: video_url_inputs, model: "voyage-multimodal-3.5" });
        expect(result.model).toBe("voyage-multimodal-3.5");
        expect(result.data?.length).toBe(video_url_inputs.length);
    }, 60000);


    test("Multimodal video embeddings with video_base64 - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.multimodalEmbed({ inputs: video_base64_inputs, model: "voyage-multimodal-3.5" });
        expect(result.model).toBe("voyage-multimodal-3.5");
        expect(result.data?.length).toBe(video_base64_inputs.length);
    }, 60000);

    test("Contextualized Chunk embeddings - happy path", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.contextualizedEmbed({ inputs: contextualized_inputs, model: "voyage-context-3" });
        expect(result.model).toBe("voyage-context-3");
        expect(result.data?.length).toBe(contextualized_inputs.length);
    });

    test("Embeddings - happy path with RequestOptions", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.embed(
            { input: documents, model: "voyage-3-large" },
            { timeoutInSeconds: 10000, maxRetries: 1, abortSignal: {dispatchEvent: (event: Event) => {return true}, removeEventListener: () => {}, addEventListener: () => {}, onabort: null, aborted: false} }

        );
        expect(result.model).toBe("voyage-3-large");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Reranking - happy path with RequestOptions", async () => {
        const client = new Client({ apiKey: process.env.VOYAGE_API_KEY || "" });
        const result = await client.rerank(
            { query: "When is the Apple's conference call scheduled?", documents: documents, model: "rerank-2" },
            { timeoutInSeconds: 10000, maxRetries: 1, abortSignal: {dispatchEvent: (event: Event) => {return true}, removeEventListener: () => {}, addEventListener: () => {}, onabort: null, aborted: false} }
        );
        expect(result.model).toBe("rerank-2");
        expect(result.data?.length).toBe(documents.length);
    });

    test("Embeddings - auth error", async () => {
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key" });
            await client.embed({
                input: documents,
                model: "voyage-3-large",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Reranking - auth error", async () => {
        await expect(async () => {
            const client = new Client({ apiKey: "not a valid key" });
            await client.rerank({
                query: "When is the Apple's conference call scheduled?",
                documents: documents,
                model: "rerank-2",
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
                model: "voyage-3-large",
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
                model: "rerank-2",
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
                model: "voyage-3-large",
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
                model: "rerank-2",
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
                model: "voyage-3-large",
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
                model: "rerank-2",
            });
        }).rejects.toThrow(VoyageAIError);
    });

    test("Embedding - no auth header", async () => {
        await expect(async () => {
            delete process.env.VOYAGE_API_KEY;
            const client = new Client();
            await client.embed({
                input: documents,
                model: "voyage-3-large",
            });
        }).rejects.toThrow(VoyageAIError);
    });
});
