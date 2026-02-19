import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    globals: true,
                    name: "unit",
                    environment: "node",
                    root: "./tests",
                    include: ["**/*.test.{js,ts,jsx,tsx}"],
                    exclude: ["wire/**", "custom/**"],
                    setupFiles: ["./setup.ts"],
                },
            },
            {
                test: {
                    globals: true,
                    name: "custom",
                    environment: "node",
                    root: "./tests/custom",
                    include: ["**/*.test.{js,ts,jsx,tsx}"],
                },
            },
            {
                test: {
                    globals: true,
                    name: "wire",
                    environment: "node",
                    root: "./tests/wire",
                    setupFiles: ["../setup.ts", "../mock-server/setup.ts"],
                },
            },
        ],
        passWithNoTests: true,
    },
});
