import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    // Stage folders keep their suite as `test.ts` alongside index.ts; other
    // modules use `*.test.ts`. Both are collected.
    include: [
      "src/**/*.test.ts",
      "src/**/test.ts",
      "tests/**/*.test.ts",
      "eval/**/*.test.ts",
    ],
    // Tier 2 (contract) tests hit live provider APIs and are excluded from the
    // default run. Invoke explicitly with `npm run test:contract`.
    exclude: ["node_modules/**", "dist/**", "tests/contract/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/pipeline/**/*.ts"],
      exclude: ["**/*.test.ts", "**/fixtures/**"],
    },
  },
});
