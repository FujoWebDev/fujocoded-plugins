import type { AstroIntegration, InjectedRoute } from "astro";
import path from "node:path";
import { addVirtualImports } from "astro-integration-kit";
import "@astrojs/db";
import { getConfig, type ConfigOptions } from "./lib/config.js";
import { readFile } from "node:fs/promises";

/**
 * Adds all the routes necessary for OAuth and its callbacks to work:
 * - `/oauth/login`, called to start the login flow
 * - `/oauth/callback`, called after the user has authorized the application
 * - `/oauth/logout`, called when the user wishes to log out
 */
const addOAuthRoutes = (injectRoute: (_: InjectedRoute) => void) => {
  injectRoute({
    pattern: "/oauth/login",
    entrypoint: path.join(import.meta.dirname, "./routes/oauth/login.js"),
    prerender: false,
  });
  injectRoute({
    pattern: "/oauth/callback",
    entrypoint: path.join(import.meta.dirname, "./routes/oauth/callback.js"),
    prerender: false,
  });
  injectRoute({
    pattern: "/oauth/logout",
    entrypoint: path.join(import.meta.dirname, "./routes/oauth/logout.js"),
    prerender: false,
  });
};

/**
 * Add two routes ATProto OAuth clients must have:
 * - `/client-metadata.json`, information about the client's identity
 *   and requested access
 * - `/jwks.json`, information about the cryptographic keys used in the
 *   authorization request
 */
const addAtProtoRoutes = (injectRoute: (_: InjectedRoute) => void) => {
  injectRoute({
    pattern: "/client-metadata.json",
    entrypoint: path.join(
      import.meta.dirname,
      "./routes/client-metadata.json.js"
    ),
    prerender: false,
  });
  injectRoute({
    pattern: "/jwks.json",
    entrypoint: path.join(import.meta.dirname, "./routes/jwks.json.js"),
    prerender: false,
  });
};

export default (
  configOptions: ConfigOptions = {
    applicationName: "AuthProto Application",
    applicationDomain: "http://localhost:4321",
  }
): AstroIntegration => ({
  name: "fujocoded:authproto",
  hooks: {
    "astro:config:setup": (setupParams) => {
      // @ts-expect-error
      const { injectRoute, addMiddleware, createCodegenDir } = setupParams;
      const codegenDir = createCodegenDir();

      // @ts-expect-error
      addOAuthRoutes(injectRoute);
      // @ts-expect-error
      addAtProtoRoutes(injectRoute);

      // Make configuration values available throughout the application
      addVirtualImports(setupParams, {
        name: "authproto-config",
        imports: [
          {
            id: "fujocoded:authproto/config",
            content: getConfig({
              options: configOptions,
            }),
            context: "server",
          },
        ],
      });

      // Add request interception that deals with authorizing the users during
      // the regular requests
      addMiddleware({
        order: "pre",
        entrypoint: path.join(import.meta.dirname, "./routes/middleware.js"),
      });
    },
    "astro:config:done": async ({ injectTypes, config, logger }) => {
      // @ts-expect-error
      if (!config.session?.driver && !config.adapter) {
        logger.error(
          "The ATproto OAuth integration uses Astro's session storage, which requires a session driver or an adapter. You have neither set. For more information, see https://docs.astro.build/en/guides/sessions/"
        );
      }
      if (!configOptions.driver) {
        logger.error(
          "The ATproto OAuth integration requires a configured session driver in production. This will be ok for dev mode."
        );
      }
      if (config.output === "static") {
        // TODO: check if a static site with some routes marked as dynamic works.
        logger.warn(
          `Your Astro output config is "static". The login status is only available on dynamically rendered pages.`
        );
      }
      injectTypes({
        filename: "types.d.ts",
        content: await readFile(
          path.join(import.meta.dirname, "./types.d.ts"),
          {
            encoding: "utf-8",
          }
        ),
      });
    },
    "astro:db:setup": ({ extendDb }) => {
      // if (configOptions.driver?.name == "astro:db") {
      //   extendDb({
      //     configEntrypoint: path.join(import.meta.dirname, "./db/tables.ts"),
      //   });
      // }
    },
  },
});
