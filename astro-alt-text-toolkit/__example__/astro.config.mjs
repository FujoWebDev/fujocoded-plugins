// @ts-check
import { defineConfig } from "astro/config";
import { plugin } from "@fujocoded/astro-alt-text-toolkit/vite";

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [plugin()],
  },
});
