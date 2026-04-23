import { defineConfig } from "tsdown";

export default defineConfig([
  {
    name: "integration",
    dts: true,
    clean: true,
    unbundle: true,
    entry: ["src/index.ts", "src/middleware.ts"],
    external: [/^astro:/],
  },
]);
