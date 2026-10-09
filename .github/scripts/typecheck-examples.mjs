// Typechecks the current package's examples that aren't npm workspaces. These
// examples need a different astro (or zod) than the one hoisted for the
// workspace, and npm never installs nested deps for a workspace that lives
// inside another workspace's folder. So each one keeps its own
// package-lock.json and install. Workspace examples are skipped here because
// the regular `typecheck` task already covers them.
//
// Usage (from a package's directory):
//   node ../.github/scripts/typecheck-examples.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPackagesSync } from "@manypkg/get-packages";

const repoRoot = resolve(import.meta.dirname, "../..");

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const findExampleDirs = () => {
  const examplesDir = resolve("__examples__");
  const candidates = [resolve("__example__"), resolve("example")];
  if (existsSync(examplesDir)) {
    for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(join(examplesDir, entry.name));
      }
    }
  }
  return candidates.filter((dir) => existsSync(join(dir, "package.json")));
};

const hasTypecheckScript = (exampleDir) => {
  const packageJson = JSON.parse(
    readFileSync(join(exampleDir, "package.json"), "utf8"),
  );
  return Boolean(packageJson.scripts?.typecheck);
};

// npm writes node_modules/.package-lock.json on every install, so it's older
// than package-lock.json exactly when the lockfile changed since the install.
const needsInstall = (exampleDir) => {
  const installedLock = join(exampleDir, "node_modules", ".package-lock.json");
  if (!existsSync(installedLock)) {
    return true;
  }
  const lockfile = join(exampleDir, "package-lock.json");
  return statSync(lockfile).mtimeMs > statSync(installedLock).mtimeMs;
};

const workspaceDirs = new Set(
  getPackagesSync(repoRoot).packages.map(({ dir }) => resolve(dir)),
);

const standaloneExampleDirs = findExampleDirs().filter(
  (dir) => !workspaceDirs.has(dir) && hasTypecheckScript(dir),
);

for (const exampleDir of standaloneExampleDirs) {
  if (needsInstall(exampleDir)) {
    run("npm", ["ci", "--no-audit", "--no-fund"], exampleDir);
  }
  run("npm", ["run", "typecheck"], exampleDir);
}
