import { defineConfig } from "tsdown";

export default defineConfig([
  {
    name: "integration",
    dts: {
      sideEffects: true,
    },
    clean: true,
    unbundle: true,
    entry: ["src/index.ts", "src/middleware.ts", "src/types.d.ts"],
    external: [/^astro:/, /^fujocoded:astro-smooth-actions\//],
  },
]);
