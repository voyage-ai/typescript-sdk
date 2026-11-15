import { describe, expect, it } from "vitest";
import * as pkg from "../../src/extended/index";

// The README imports these names from the package root.
describe("package root exports", () => {
    it("exports the logging helpers used in the README", () => {
        expect(pkg.logging.LogLevel.Debug).toBeDefined();
        expect(new pkg.logging.ConsoleLogger()).toBeInstanceOf(pkg.logging.ConsoleLogger);
    });

    it("exports the generated namespaces and environment", () => {
        expect("VoyageAI" in pkg).toBe(true);
        expect(pkg.VoyageAIEnvironment.Default).toBeDefined();
        expect(pkg.serialization).toBeDefined();
    });

    it("accepts logging options on the extended client", () => {
        const request: pkg.VoyageAI.EmbedRequest = { input: "hello", model: "voyage-3" };
        const client = new pkg.VoyageAIClient({
            apiKey: "x",
            logging: { level: pkg.logging.LogLevel.Debug, logger: new pkg.logging.ConsoleLogger(), silent: true },
        });
        expect(request.input).toBe("hello");
        expect(client).toBeDefined();
    });
});
