import { defineConfig } from "vitest/config";
import path from "node:path";

/* Tests reuse the app's own path aliases so `@/pages/costing` resolves exactly
   as it does at build time. Node environment only — the costing engine is a
   pure function and needs no DOM. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
