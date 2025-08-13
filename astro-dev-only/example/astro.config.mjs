// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
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
  // These will work also in server mode! Uncomment this configuration
  // and see for yourself 👇👀
  // output: "server",
  // adapter: node({
  //   mode: "standalone",
  // }),
});
