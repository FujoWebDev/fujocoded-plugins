// @ts-check
import { defineConfig } from "astro/config";
import devOnly from "@fujocoded/astro-dev-only";

// https://astro.build/config
export default defineConfig({
  integrations: [
    devOnly({
      routePatterns: [
        // Remove the page generated from `src/pages/dev-only/static.astro`
        "/dev-only/static",
        // Remove the page generated from `src/pages/dev-only/old-school.html`
        "/dev-only/old-school",
        // Remove all pages generated from within `src/pages/dev-only/in-folder/`
        new RegExp("^/dev-only/in-folder/"),
        // Remove all pages generated from within `/dev-only/dynamic/`, except for `/dev-only/dynamic/[safe]`
        new RegExp("^/dev-only/dynamic/\\[(?!safe).+\\]"),
      ],
      dryRun: true,
    }),
  ],
});
