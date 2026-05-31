import { defineConfig } from "tsdown";

export default defineConfig([
  {
    name: "msw-atproto",
    dts: true,
    clean: true,
    unbundle: true,
    entry: ["src/index.ts"],
  },
]);
