import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/worker.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: true,
  skipNodeModulesBundle: true,
});
