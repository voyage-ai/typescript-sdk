/**
 * Test script for local model integration with @huggingface/transformers
 */

import { VoyageAIClient } from "./src/extended";
import { countTokens, isLocalModel, getModelConfig, validateDimension } from "./src/local";

function l2Norm(vec: number[]): number {
    return Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
}

async function testSingleEmbed() {
    console.log("--- Single text embedding ---");
    const client = new VoyageAIClient();
    const result = await client.embed({
        input: "Hello, world!",
        model: "voyage-4-nano",
    });

    console.log("  Model:", result.model);
    console.log("  Embeddings count:", result.data?.length);
    console.log("  Dimension:", result.data?.[0]?.embedding?.length);
    console.log("  First 5 values:", result.data?.[0]?.embedding?.slice(0, 5));
    console.log("  L2 norm:", l2Norm(result.data?.[0]?.embedding ?? []));
    console.log("  Usage:", result.usage);

    const norm = l2Norm(result.data?.[0]?.embedding ?? []);
    if (Math.abs(norm - 1.0) > 0.01) {
        throw new Error(`L2 norm should be ~1.0, got ${norm}`);
    }
    console.log("  PASS\n");
}

async function testBatchEmbed() {
    console.log("--- Batch embedding ---");
    const client = new VoyageAIClient();
    const result = await client.embed({
        input: ["Hello, world!", "Voyage AI makes embeddings easy.", "TypeScript SDK test."],
        model: "voyage-4-nano",
    });

    console.log("  Embeddings count:", result.data?.length);
    if (result.data?.length !== 3) {
        throw new Error(`Expected 3 embeddings, got ${result.data?.length}`);
    }
    for (const item of result.data ?? []) {
        const norm = l2Norm(item.embedding ?? []);
        if (Math.abs(norm - 1.0) > 0.01) {
            throw new Error(`L2 norm should be ~1.0, got ${norm}`);
        }
    }
    console.log("  PASS\n");
}

async function testDimensions() {
    console.log("--- Matryoshka dimensions ---");
    const client = new VoyageAIClient();
    for (const dim of [2048, 1024, 512, 256]) {
        const result = await client.embed({
            input: "Test dimension support",
            model: "voyage-4-nano",
            outputDimension: dim,
        });
        const actualDim = result.data?.[0]?.embedding?.length;
        const norm = l2Norm(result.data?.[0]?.embedding ?? []);
        console.log(`  dim=${dim}: actual=${actualDim}, norm=${norm.toFixed(4)}`);
        if (actualDim !== dim) {
            throw new Error(`Expected dimension ${dim}, got ${actualDim}`);
        }
        if (Math.abs(norm - 1.0) > 0.01) {
            throw new Error(`L2 norm should be ~1.0, got ${norm}`);
        }
    }
    console.log("  PASS\n");
}

async function testUnsupportedDimension() {
    console.log("--- Unsupported dimension error ---");
    const client = new VoyageAIClient();
    try {
        await client.embed({
            input: "Test",
            model: "voyage-4-nano",
            outputDimension: 999,
        });
        throw new Error("Should have thrown for unsupported dimension");
    } catch (e: any) {
        if (e.message.includes("Invalid outputDimension")) {
            console.log("  Correctly threw:", e.message);
        } else {
            throw e;
        }
    }
    console.log("  PASS\n");
}

async function testTokenCounting() {
    console.log("--- Token counting ---");
    const count = await countTokens("voyage-4-nano", ["Hello, world!", "Voyage AI"]);
    console.log("  Token count:", count);
    if (count <= 0) {
        throw new Error(`Token count should be positive, got ${count}`);
    }
    console.log("  PASS\n");
}

async function testModelRegistry() {
    console.log("--- Model registry ---");
    console.log("  isLocalModel('voyage-4-nano'):", isLocalModel("voyage-4-nano"));
    console.log("  isLocalModel('voyage-3-lite'):", isLocalModel("voyage-3-lite"));

    const config = getModelConfig("voyage-4-nano");
    console.log("  Config:", config);

    const dim = validateDimension(config, undefined);
    console.log("  Default dimension:", dim);
    if (dim !== 2048) throw new Error(`Expected default 2048, got ${dim}`);

    try {
        getModelConfig("nonexistent-model");
        throw new Error("Should have thrown");
    } catch (e: any) {
        if (!e.message.includes("Unsupported local model")) throw e;
        console.log("  Correctly rejects unknown model");
    }
    console.log("  PASS\n");
}

async function testPipelineCaching() {
    console.log("--- Pipeline caching (second call should be fast) ---");
    const client = new VoyageAIClient();

    const t0 = Date.now();
    await client.embed({ input: "First call", model: "voyage-4-nano" });
    const firstMs = Date.now() - t0;

    const t1 = Date.now();
    await client.embed({ input: "Second call", model: "voyage-4-nano" });
    const secondMs = Date.now() - t1;

    console.log(`  First call: ${firstMs}ms`);
    console.log(`  Second call: ${secondMs}ms`);
    if (secondMs < firstMs) {
        console.log("  Second call was faster (pipeline cached)");
    }
    console.log("  PASS\n");
}

async function testApiEmbed(apiKey: string) {
    console.log("--- API embedding (voyage-3-lite) ---");
    const client = new VoyageAIClient({ apiKey });

    const result = await client.embed({
        input: "Hello, world!",
        model: "voyage-3-lite",
    });

    console.log("  Model:", result.model);
    console.log("  Embeddings count:", result.data?.length);
    console.log("  Dimension:", result.data?.[0]?.embedding?.length);
    console.log("  PASS\n");
}

async function main() {
    const apiKey = process.argv[2] || process.env.VOYAGE_API_KEY;

    console.log("VoyageAI SDK - Local Model Integration Test\n");
    console.log("============================================\n");

    await testModelRegistry();
    await testSingleEmbed();
    await testBatchEmbed();
    await testDimensions();
    await testUnsupportedDimension();
    await testTokenCounting();
    await testPipelineCaching();

    if (apiKey) {
        await testApiEmbed(apiKey);
    } else {
        console.log("--- Skipping API test (no API key provided) ---\n");
    }

    console.log("============================================");
    console.log("All tests passed.");
}

main().catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
