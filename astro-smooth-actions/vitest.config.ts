import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "__tests__/e2e/**"],
    include: ["__tests__/**/*.test.ts"],
    setupFiles: "./__tests__/setup.ts",
  },
});
