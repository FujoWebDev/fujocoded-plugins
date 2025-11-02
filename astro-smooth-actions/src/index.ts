import type { AstroIntegration } from "astro";
import path from "node:path";

export { onRequest } from "./middleware.js";

export default function astroActionSessions(): AstroIntegration {
  return {
    name: "astro-smooth-actions",
    hooks: {
      "astro:config:setup": ({ addMiddleware }) => {
        addMiddleware({
          order: "pre",
          entrypoint: path.join(import.meta.dirname, "./middleware.js"),
        });
      },
      "astro:config:done": ({ config, logger }) => {
        if (!config.session?.driver && !config.adapter) {
          logger.warn(
            "The astro-smooth-actions integration uses Astro's session storage, which requires a session driver or an adapter. You have neither set. For more information, see https://docs.astro.build/en/guides/sessions/"
          );
        }
      },
    },
  };
}
