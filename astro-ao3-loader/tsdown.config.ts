import { defineConfig } from "tsdown";

export default defineConfig([
  {
    name: "astro-ao3-loader",
    dts: true,
    clean: true,
    unbundle: true,
    entry: ["src/index.ts"],
    external: [/^astro:?/, /^zod(\/.*)?$/],
  },
]);
