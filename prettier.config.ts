import type { Config } from "prettier";

const config: Config = {
  plugins: ["prettier-plugin-astro"],
  overrides: [{ files: "*.astro", options: { parser: "astro" } }],
};

export default config;
