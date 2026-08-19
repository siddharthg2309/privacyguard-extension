import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["**/*.test.ts", "**/*.bench.ts", "packages/testing-fixtures/**"],
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "apps/cli/test/**/*.test.ts"],
    include: [
      "packages/**/*.test.ts",
      "apps/cli/src/**/*.test.ts",
      "apps/browser-extension/lib/**/*.test.ts",
    ],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
