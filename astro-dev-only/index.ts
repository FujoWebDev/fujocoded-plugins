import type { AstroIntegration, RouteData } from "astro";
import { rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Pattern = string | RegExp;

const getDevOnlyRoutes = (allRoutes: RouteData[], routePatterns: Pattern[]) => {
  const matchesPattern = (route: RouteData, pattern: Pattern) => {
    if (typeof pattern === "string") {
      return (
        route.route === pattern || route.route === join(pattern, "index.html")
      );
    }
    return pattern.test(route.route);
  };
  return allRoutes.filter((route) =>
    routePatterns.some((pattern) => matchesPattern(route, pattern))
  );
};

const getRelativeFileSystemPath = (route: RouteData) => {
  if (route.distURL) {
    const pathname = fileURLToPath(route.distURL.toString());
    // This is a static route, so it's easy-peasy.
    return pathname.replace(join(process.cwd(), "dist/"), "");
  }
};

const throwIfNotInsideDist = (path: string | URL) => {
  // To avoid issues, we make sure the path we get is always inside the current
  // directory. `rm` is a dangerous command!
  const resolvedPath = resolve(path.toString());
  const isWithinCwd = resolvedPath.startsWith(process.cwd());

  if (!isWithinCwd) {
    throw new Error(
      `Attempt to remove dangerous path: ${path} (${resolvedPath})`
    );
  }
};

export default function devOnlyRoutesIntegration({
  routePatterns = [],
  dryRun = false,
}: {
  routePatterns: Pattern[];
  dryRun?: boolean;
}): AstroIntegration {
  return {
    name: "dev-only-routes",
    hooks: {
      "astro:build:done": async ({ routes, logger }) => {
        // console.dir(routes, { depth: null });
        const devOnlyRoutes = getDevOnlyRoutes(routes, routePatterns);
        // console.dir(devOnlyRoutes, { depth: null });
        for (const route of devOnlyRoutes) {
          if (route.distURL) {
            const relativePath = getRelativeFileSystemPath(route);
            logger.info(
              dryRun
                ? `DRY RUN: ❌ (NOT) Removing [your-site]/${relativePath} from final build`
                : `❌ Removing ${relativePath} from final build`
            );
            throwIfNotInsideDist(route.distURL);
            if (!dryRun) {
              await rm(route.distURL);
            } else {
              logger.info(`DRY RUN: 🗑️ ⬅️  ${route.distURL}`);
            }
          }
        }
      },
    },
  };
}
