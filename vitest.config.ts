import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/*.test.ts", "**/*.bench.ts", "packages/testing-fixtures/**"],
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    include: ["packages/**/*.test.ts"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
