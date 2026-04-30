import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**", ".tmp_*/**", "buildmind_v4/**"],
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
