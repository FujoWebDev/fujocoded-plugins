import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type DevOnlyBuildRoute = {
  route: string;
  prerender: boolean;
  distURL?: URL | URL[] | null;
};

const getDevOnlyStaticRoutes = (
  allRoutes: DevOnlyBuildRoute[],
  routePatterns: Pattern[],
) => {
  const matchesPattern = (route: DevOnlyBuildRoute, pattern: Pattern) => {
    if (typeof pattern === "string") {
      return route.route === pattern;
    }
    return pattern.test(route.route);
  };
  return allRoutes.filter(
    (route) =>
      route.prerender &&
      routePatterns.some((pattern) => matchesPattern(route, pattern)),
  );
};

const getFileSystemPath = (path: string | URL) =>
  path instanceof URL ? fileURLToPath(path) : path;

const throwIfOutsideBuildOutput = (path: string | URL) => {
  const resolvedPath = resolve(getFileSystemPath(path));
  const buildOutputPath = resolve(process.cwd(), "dist");
  const relativeToBuildOutput = relative(buildOutputPath, resolvedPath);
  const isWithinBuildOutput =
    relativeToBuildOutput === "" ||
    (!relativeToBuildOutput.startsWith("..") &&
      !isAbsolute(relativeToBuildOutput));

  if (!isWithinBuildOutput) {
    throw new Error(
      `Attempt to remove dangerous path: ${path} (${resolvedPath})`,
    );
  }
};

export const removeDevOnlyStaticFiles = async ({
  routes,
  routePatterns,
  dryRun = false,
  logger,
}: {
  routes: DevOnlyBuildRoute[];
  routePatterns: Pattern[];
  dryRun?: boolean;
  logger: { info(message: string): void };
}) => {
  const devOnlyRoutes = getDevOnlyStaticRoutes(routes, routePatterns);
  const devOnlyRoutesAndPaths = devOnlyRoutes
    // For non pre-rendered routes, route.distURL will be null. We don't
    // need to handle those here because we'll handle those via middleware (one day).
    .filter((route): route is DevOnlyBuildRoute & { distURL: URL | URL[] } =>
      Boolean(route.distURL),
    )
    // In Astro4, each route is associated with a single file URL. In Astro5, it's an Array of URL.
    // We normalize these by always returning an Array, creating an array of [route, paths[]].
    .map(
      (route) =>
        [
          route.route,
          Array.isArray(route.distURL) ? route.distURL : [route.distURL],
        ] as const,
    );

  for (const [route, filePaths] of devOnlyRoutesAndPaths) {
    logger.info(
      dryRun
        ? `DRY RUN: ❌ (NOT) Removing file(s) for "src/pages${route}":`
        : `❌ Removing files for "src/pages${route}" from final build`,
    );
    for (const filePath of filePaths) {
      const relativePath = relative(process.cwd(), getFileSystemPath(filePath));
      // This is just an extra precaution because I don't want to have anyone's files
      // on my conscience.
      throwIfOutsideBuildOutput(filePath);
      if (!dryRun) {
        await rm(filePath);
      } else {
        logger.info(`DRY RUN:   - 🗑️ ⬅️  ./${relativePath}`);
      }
    }
  }
};
