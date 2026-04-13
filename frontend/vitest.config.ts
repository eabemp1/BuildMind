import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["__tests__/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      reporter: ["text", "lcov"],
      include: [
        "lib/scoring/**",
        "lib/stages/**",
        "lib/billing/**",
        "app/api/billing/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
