// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import mdx from "@astrojs/mdx";

import remarkExcalidraw from "@fujocoded/remark-excalidraw";

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  adapter: node({
    mode: "standalone",
  }),

  integrations: [mdx({
    remarkPlugins: [remarkExcalidraw],
  }), react()],
});