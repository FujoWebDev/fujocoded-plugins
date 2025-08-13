// @ts-check
import { defineConfig } from "astro/config";
import devOnly from "@fujocoded/astro-dev-only";

// https://astro.build/config
export default defineConfig({
  integrations: [
    devOnly({
      routePatterns: ["/dev-only/static"],
      dryRun: true,
    }),
  ],
});
