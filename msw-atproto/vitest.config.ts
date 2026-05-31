import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "tests",
          include: ["__tests__/**/*.test.ts"],
          setupFiles: ["./__tests__/setup.ts"],
        },
      },
      {
        test: {
          name: "examples",
          include: ["__examples__/**/*.test.ts"],
          setupFiles: ["./__examples__/setup.ts"],
        },
      },
    ],
  },
});
