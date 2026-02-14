import { defineConfig, type UserConfig } from "tsdown";
import { glob } from "glob";

const COMMON_CONFIG = {
  unbundle: true,
  fixedExtension: false,
  dts: {
    sideEffects: true,
  },
} satisfies Partial<UserConfig>;

const baseExternal = [/^fujocoded:authproto/, /^astro:/];
const astroFileExternal = [...baseExternal, /\.astro$/];

export default defineConfig([
  {
    name: "components",
    entry: ["src/components.ts"],
    copy: [{ from: "src/components/", to: "dist/components/" }],
    external: astroFileExternal,
    clean: true,
    ...COMMON_CONFIG,
  },
  {
    name: "integration",
    entry: [
      "src/index.ts",
      "src/helpers.ts",
      "src/types.d.ts",
      "src/db/tables.ts",
    ],
    external: astroFileExternal,
    ...COMMON_CONFIG,
  },
  {
    name: "routes",
    entry: [...glob.sync(`./src/routes/**/*.ts`)],
    outputOptions: {
      dir: `./dist/routes/`,
    },
    external: baseExternal,
    ...COMMON_CONFIG,
  },
  {
    name: "stores",
    entry: ["src/stores/unstorage.ts", "src/stores/db.ts"],
    outputOptions: {
      dir: `./dist/stores/`,
    },
    external: [...baseExternal, "astro:db"],
    ...COMMON_CONFIG,
  },
]);
