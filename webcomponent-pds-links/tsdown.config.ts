import { defineConfig, type UserConfig } from "tsdown";
import { glob } from "glob";

export default defineConfig([
  {
    // name: "routes",
    // entry: [...glob.sync(`./src/routes/**/*.ts`)],
    // outputOptions: {
    //   dir: `./dist/routes/`,
    // },
    dts: true,
    clean: true,
    unbundle: true,
    // external: [/^fujocoded:authproto/, /^astro:/],
  },
]);
