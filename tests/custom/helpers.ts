import * as fs from "fs";
import * as path from "path";

export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function assertNormalized(vec: number[], tolerance = 1e-3): void {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(Math.abs(norm - 1.0)).toBeLessThan(tolerance);
}

export function loadImageBase64(): string {
    const imagePath = path.join(__dirname, "example_image_01.jpg");
    const imageBuffer = fs.readFileSync(imagePath);
    return "data:image/jpeg;base64," + imageBuffer.toString("base64");
}

export function loadVideoBase64(): string {
    const videoPath = path.join(__dirname, "example_video_01.mp4");
    const videoBuffer = fs.readFileSync(videoPath);
    return "data:video/mp4;base64," + videoBuffer.toString("base64");
}
