import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import astroSmoothActions from "@fujocoded/astro-smooth-actions";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [astroSmoothActions()],
});
