import type { AstroIntegration } from "astro";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeConfig, type AstroSmoothActionsConfig } from "./config.js";

export { ACTION_INPUT_CONTROL, ACTION_INPUT_NONE } from "./controls.js";
export { DEFAULT_EXCLUDED_FIELDS } from "./config.js";
export type {
  AstroSmoothActionsConfig,
  AstroSmoothActionsInputOptions,
} from "./config.js";

const CONFIG_MODULE_ID = "fujocoded:astro-smooth-actions/config";
const RESOLVED_CONFIG_MODULE_ID = `\0${CONFIG_MODULE_ID}`;

const createConfigPlugin = (config: AstroSmoothActionsConfig) => ({
  name: "fujocoded:astro-smooth-actions-config",
  resolveId(id: string) {
    if (id === CONFIG_MODULE_ID) {
      return RESOLVED_CONFIG_MODULE_ID;
    }
  },
  load(id: string) {
    if (id === RESOLVED_CONFIG_MODULE_ID) {
      return `export const astroSmoothActionsConfig = ${JSON.stringify(
        normalizeConfig(config),
      )};`;
    }
  },
});

type MiddlewareModule = typeof import("./middleware.js");

let middlewareModule: MiddlewareModule | null = null;

/**
 * Reads back the raw form fields that produced the latest action result, so you
 * can show the visitor exactly what they submitted.
 *
 * Pass the current page's `locals` and the action you rendered the result for:
 *
 * ```ts
 * const input = await getActionInput({
 *   locals: Astro.locals,
 *   action: actions.subscribe,
 * });
 * ```
 *
 * Returns an object of the stored fields, where each one is either:
 *
 * - A string holding the submitted value, for a field submitted once
 * - An array of strings, in submission order, for a field submitted more than
 *   once (several inputs sharing a name, or a multi-select)
 * - `null` for a submitted field whose value was intentionally not stored, such
 *   as a file input or an excluded field
 *
 * Returns `undefined` when the latest result came from a different action, or
 * when input storage was disabled for the action or form.
 */
export const getActionInput = async (
  ...args: Parameters<MiddlewareModule["getActionInput"]>
) => {
  // Import lazily so `astro:actions` is not pulled in during config evaluation,
  // where it is not available yet.
  if (!middlewareModule) {
    middlewareModule = await import("./middleware.js");
  }
  return middlewareModule.getActionInput(...args);
};

export default function astroSmoothActions(
  config: AstroSmoothActionsConfig = {},
): AstroIntegration {
  return {
    name: "astro-smooth-actions",
    hooks: {
      "astro:config:setup": ({ addMiddleware, updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [createConfigPlugin(config)],
          },
        });
        addMiddleware({
          order: "pre",
          entrypoint: path.join(import.meta.dirname, "./middleware.js"),
        });
      },
      "astro:config:done": async ({ config, injectTypes, logger }) => {
        if (!config.session?.driver && !config.adapter) {
          logger.warn(
            "The astro-smooth-actions integration uses Astro's session storage, which needs a session driver or an adapter, and you have neither configured. Your form actions still run, but without the smooth redirect. To turn it on, set one up: https://docs.astro.build/en/guides/sessions/",
          );
        }

        injectTypes({
          filename: "types.d.ts",
          content: await readFile(
            path.join(import.meta.dirname, "./types.d.ts"),
            {
              encoding: "utf-8",
            },
          ),
        });
      },
    },
  };
}
