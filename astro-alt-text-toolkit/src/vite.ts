import type { Plugin } from "vite";

export const plugin = (): Plugin => {
  return {
    name: "alt-text-files",
    // https://github.com/vbenjs/vite-plugin-html/blob/main/packages/core/src/htmlPlugin.ts
    transform(code, id, options) {
      if (id.endsWith("astro") || id.endsWith("html")) {
        console.log(id);
        console.log(code);
        console.log(options);
      }
    },
  };
};
