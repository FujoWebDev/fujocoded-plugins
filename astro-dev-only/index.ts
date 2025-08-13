import type {
  AstroIntegration as AstroIntegrationV4,
  RouteData as RouteDataV4,
} from "astro-types-v4";
import type {
  AstroIntegration as AstroIntegrationV5,
  RouteData as RouteDataV5,
} from "astro-types-v5";
import { rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Pattern = string | RegExp;
// We define RouteData as the union of RouteData in Astro 4 and RouteData in Astro 5.
// This is because we might be passed either.
type RouteData = RouteDataV4 | RouteDataV5;
// We define AstroIntegration as the intersection of AstroIntegration in Astro 4 and
// AstroIntegration in Astro 5.
// This is because our integration needs to be passed to either.
type AstroIntegration = AstroIntegrationV4 & AstroIntegrationV5;

const getDevOnlyRoutes = (allRoutes: RouteData[], routePatterns: Pattern[]) => {
  const matchesPattern = (route: RouteData, pattern: Pattern) => {
    if (typeof pattern === "string") {
      return route.route === pattern;
    }
    return pattern.test(route.route);
  };
  return allRoutes.filter((route) =>
    routePatterns.some((pattern) => matchesPattern(route, pattern))
  );
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
    name: "@fujocoded/astro-dev-only",
    hooks: {
      "astro:build:done": async ({ routes, logger }) => {
        const devOnlyRoutes = getDevOnlyRoutes(routes, routePatterns);
        const devOnlyRoutesAndPaths = devOnlyRoutes
          // For non pre-rendered routes, route.distURL will be null. We don't
          // need to handle those here because we'll handle those via middleware (one day).
          .filter((route) => !!route.distURL)
          // In Astro4, each route is associated with a single file URL. In Astro5, it's an Array of URL.
          // We normalize these by always returning an Array, creating an array of [route, paths[]].
          // Forgive the magic typescript incantation.
          .map(
            (route) =>
              [
                route.route,
                Array.isArray(route.distURL)
                  ? route.distURL
                  : ([route.distURL] as URL[]),
              ] as const
          );

        for (const [route, filePaths] of devOnlyRoutesAndPaths) {
          logger.info(
            dryRun
              ? `DRY RUN: ❌ (NOT) Removing file(s) for "src/pages${route}":`
              : `❌ Removing files for "src/pages${route}" from final build`
          );
          for (const filePath of filePaths) {
            const relativePath = relative(process.cwd(), filePath.pathname);
            // This is just an extra precaution because I don't want to have anyone's files
            // on my conscience.
            throwIfNotInsideDist(filePath);
            if (!dryRun) {
              await rm(filePath);
            } else {
              logger.info(`DRY RUN:   - 🗑️ ⬅️  ./${relativePath}`);
            }
          }
        }
      },
    },
  };
}
