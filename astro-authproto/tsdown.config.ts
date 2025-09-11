import { defineConfig, type UserConfig } from "tsdown";
import { glob } from "glob";

export default defineConfig([
  {
    name: "components",
    entry: ["src/components.ts"],
    dts: true,
    clean: true,
    unbundle: true,
    copy: [{ from: "src/components", to: "dist/components" }],
    external: [/^fujocoded:authproto/, /^astro:/, /\.astro$/],
  },
  {
    name: "tables",
    entry: ["src/db/tables.ts"],
    outputOptions: {
      dir: `./dist/db/`,
    },
    clean: true,
    unbundle: true,
    external: [/^fujocoded:authproto/, /^astro:/, /\.astro$/],
  },
  {
    name: "integration",
    dts: true,
    clean: true,
    unbundle: true,
    entry: ["src/index.ts", "src/types.d.ts"],
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
]);
