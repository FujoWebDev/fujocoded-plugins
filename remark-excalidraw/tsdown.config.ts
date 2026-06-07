import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    component: "src/component.tsx",
    index: "src/index.ts",
  },
  external: ["react", "react/jsx-runtime"],
  fixedExtension: false,
  format: ["esm"],
});
