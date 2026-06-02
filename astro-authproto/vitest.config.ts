import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "fujocoded:authproto/config": fileURLToPath(
        new URL("./__tests__/virtual/config.ts", import.meta.url),
      ),
      "fujocoded:authproto/stores": fileURLToPath(
        new URL("./__tests__/virtual/stores.ts", import.meta.url),
      ),
      "fujocoded:authproto/hooks": fileURLToPath(
        new URL("./__tests__/virtual/hooks.ts", import.meta.url),
      ),
      "@fujocoded/msw-atproto": fileURLToPath(
        new URL("../msw-atproto/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
  },
});
