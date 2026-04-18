import { defineConfig } from "tsdown";

export default defineConfig([
  {
    name: "astro-atproto-loader",
    dts: true,
    clean: true,
    unbundle: true,
    entry: ["src/index.ts"],
    external: [/^astro:?/],
  },
]);
