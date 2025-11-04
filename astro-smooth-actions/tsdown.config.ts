import { defineConfig, type UserConfig } from "tsdown";
import { glob } from "glob";

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
