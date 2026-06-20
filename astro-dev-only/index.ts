import type {
  AstroIntegration as AstroIntegrationV4,
  ViteUserConfig as ViteUserConfigV4,
} from "astro-types-v4";
import type {
  AstroIntegration as AstroIntegrationV5,
  ViteUserConfig as ViteUserConfigV5,
} from "astro-types-v5";
import { removeDevOnlyStaticFiles } from "./static-files.ts";

// We define AstroIntegration as the intersection of AstroIntegration in Astro 4 and
// AstroIntegration in Astro 5.
// This is because our integration needs to be passed to either.
type AstroIntegration = AstroIntegrationV4 & AstroIntegrationV5;

const serializeRoutePatterns = (routePatterns: Pattern[]) =>
  routePatterns
    .map((route) =>
      typeof route === "string" ? JSON.stringify(route) : route.toString(),
    )
    .join(", ");

// To pass arguments between config and middleware, we use a vite virtual module
// plugin.
type VitePlugins = NonNullable<
  ViteUserConfigV4["plugins"] | ViteUserConfigV5["plugins"]
>;
export const passRoutePatternsToMiddleware = (routePatterns: Pattern[]) =>
  ({
    name: "fujocoded-dev-only-routes-export",
    resolveId: (id) => {
      if (id === "fujocoded:dev-only-routes") {
        return "\0fujocoded:dev-only-routes"; // Prefix with \0 to mark as virtual
      }
    },
    load: (id) => {
      if (id === "\0fujocoded:dev-only-routes") {
        return `export const excludedPatterns = [${serializeRoutePatterns(routePatterns)}];`;
      }
    },
  }) satisfies VitePlugins[number];

export default function devOnlyRoutesIntegration({
  routePatterns,
  dryRun = false,
}: {
  routePatterns: Pattern[];
  dryRun?: boolean;
}): AstroIntegration {
  return {
    name: "@fujocoded/astro-dev-only",
    hooks: {
      // For server routes, we add a middleware during the build setup to
      // intercept requests and send back a 404 if they match one of the patterns
      "astro:config:setup": async ({
        command,
        addMiddleware,
        updateConfig,
      }) => {
        if (command !== "build") {
          return;
        }
        updateConfig({
          vite: {
            plugins: [passRoutePatternsToMiddleware(routePatterns)],
          },
        });
        addMiddleware({
          order: "pre",
          entrypoint: "@fujocoded/astro-dev-only/middleware",
        });
      },
      // For pre-rendered routes, we remove the generated files from the
      // final build
      "astro:build:done": async ({ routes, logger }) => {
        await removeDevOnlyStaticFiles({
          routes,
          routePatterns,
          dryRun,
          logger,
        });
      },
    },
  };
}
