import { defineConfig, type UserConfig } from "tsdown";
import { glob } from "glob";

export default defineConfig([
  {
    name: "integration",
    dts: true,
    clean: true,
    unbundle: true,
    entry: "src/index.ts",
    external: [/^fujocoded:authproto/, /^astro:/],
  },
  {
    name: "routes",
    entry: [...glob.sync(`./src/routes/**/*.ts`)],
    outputOptions: {
      dir: `./dist/routes/`,
    },
    dts: true,
    clean: true,
    unbundle: true,
    external: [/^fujocoded:authproto/, /^astro:/],
  },
  //   {
  //     name: "components",
  //     dts: true,
  //     clean: true,
  //     unbundle: true,
  //     copy: ["src/components", { from: "src/components", to: "dist/components" }],
  //   },
]);
