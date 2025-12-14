import { defineConfig, type UserConfig } from "tsdown";
import { glob } from "glob";

const COMMON_CONFIG = {
  clean: true,
  unbundle: true,
  fixedExtension: false,
  dts: {
    sideEffects: true
  }
} satisfies Partial<UserConfig>;

const baseExternal = [/^fujocoded:authproto/, /^astro:/];
const astroFileExternal = [...baseExternal, /\.astro$/];

export default defineConfig([
  {
    name: "components",
    entry: ["src/components.ts"],
    copy: [{ from: "src/components", to: "dist/components" }],
    external: astroFileExternal,
    ...COMMON_CONFIG,
  },
  {
    name: "tables",
    entry: ["src/db/tables.ts"],
    outputOptions: {
      dir: `./dist/db/`,
    },
    external: astroFileExternal,
    ...COMMON_CONFIG,
    dts: false,
  },
  {
    name: "integration",
    entry: ["src/index.ts", "src/types.d.ts"],
    external: baseExternal,
    ...COMMON_CONFIG,
  },
  {
    name: "helpers",
    entry: ["src/helpers.ts", "src/types.d.ts"],
    external: baseExternal,
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
    name: "stores-unstorage",
    entry: ["src/stores/unstorage.ts"],
    outputOptions: {
      dir: `./dist/stores/`,
    },
    external: baseExternal,
    ...COMMON_CONFIG,
  },
  {
    name: "stores-db",
    entry: ["src/stores/db.ts"],
    outputOptions: {
      dir: `./dist/stores/`,
    },
    external: [...baseExternal, "astro:db"],
    ...COMMON_CONFIG,
  },
]);
