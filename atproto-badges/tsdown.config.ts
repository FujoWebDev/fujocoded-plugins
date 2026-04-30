import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  unbundle: true,
  fixedExtension: false,
  dts: {
    sideEffects: true,
  },
  clean: true,
});
