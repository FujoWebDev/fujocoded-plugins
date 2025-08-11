import type { AstroIntegration } from "astro";
import { rm } from "node:fs/promises";
import { join } from "node:path";

export default function devOnlyRoutesIntegration({
  routePatterns = [],
  dryRun = false,
}: {
  routePatterns: (string | RegExp)[];
  dryRun?: boolean;
}): AstroIntegration {
  return {
    name: "dev-only-routes",
    hooks: {
      "astro:build:done": async ({ routes, logger }) => {
        const devOnlyRoutes = routes.filter(
          (r) =>
            r.route &&
            routePatterns.some((pattern) =>
              typeof pattern === "string"
                ? r.route === pattern || r.route === join(pattern, "index.html")
                : pattern.test(r.route)
            )
        );
        for (const route of devOnlyRoutes) {
          if (route.distURL) {
            const relativePath = route.distURL.pathname.replace(
              join(process.cwd(), "dist/"),
              ""
            );
            logger.info(
              `❌ Removing ${relativePath} from final build${
                dryRun ? " (dry run)" : ""
              }`
            );
            if (!dryRun) {
              await rm(route.distURL);
            } else {
              logger.info(`🗑️  ${route.distURL} would have been removed`);
            }
          }
        }
      },
    },
  };
}
