import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertVersionedFirstReleasePackage,
  getPendingChangesets,
  resolveFirstReleasePackage,
} from "./first-release-packages.mjs";
import { dispatchFirstRelease as runDispatchFirstRelease } from "./first-release-dispatch.mjs";
import { syncBackFirstRelease as runSyncBackFirstRelease } from "./first-release-sync-back.mjs";

const run = (cmd, args, options = {}) => {
  const { dryRun, ...execOptions } = options;

  if (dryRun) {
    const cwd = execOptions.cwd ? ` (cwd: ${execOptions.cwd})` : "";
    const command = [cmd, ...args].join(" ");
    console.log(`[dry-run]${cwd} ${command}`);
    return;
  }

  execFileSync(cmd, args, {
    stdio: "inherit",
    ...execOptions,
  });
};

const capture = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...options }).trim();

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const envWithGithubToken = (repoRoot) => {
  if (process.env.GITHUB_TOKEN) {
    return process.env;
  }

  const token = spawnSync("gh", ["auth", "token"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  const githubToken = token.status === 0 ? token.stdout.trim() : "";

  if (!githubToken) {
    return process.env;
  }

  return {
    ...process.env,
    GITHUB_TOKEN: githubToken,
  };
};

export const findRepoRoot = (fromDir) => {
  let dir = fromDir;

  while (dir !== dirname(dir)) {
    const packageJsonPath = join(dir, "package.json");

    if (!existsSync(packageJsonPath)) {
      dir = dirname(dir);
      continue;
    }

    const packageJson = readJson(packageJsonPath);
    if (packageJson.workspaces) {
      return dir;
    }

    dir = dirname(dir);
  }

  throw new Error("Could not find repo root package.json with workspaces.");
};

const assertCleanTree = (repoRoot) => {
  const status = capture("git", ["status", "--short"], { cwd: repoRoot });
  if (status) {
    throw new Error(
      `Working tree must be clean before running this helper.\n\n${status}`,
    );
  }
};

const getBranchName = (pkg, options) =>
  options.branch ?? `first-release/${pkg.dir}-0.0.1`;

const removeUnrelatedChangesets = ({ dryRun, pkg, repoRoot }) => {
  const selectedChangesets = new Set(pkg.changesetFiles);
  const files = getPendingChangesets(repoRoot).filter(
    (file) => !selectedChangesets.has(file),
  );

  for (const file of files) {
    if (dryRun) {
      console.log(`[dry-run] Would remove ${file}`);
      continue;
    }

    rmSync(join(repoRoot, file));
  }
};

const findLockfilePackageDirs = (rootDir) => {
  const packageDirs = new Set();

  if (
    existsSync(join(rootDir, "package.json")) &&
    existsSync(join(rootDir, "package-lock.json"))
  ) {
    packageDirs.add(rootDir);
  }

  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }

      if (!entry.isDirectory()) {
        continue;
      }

      const path = join(dir, entry.name);
      if (
        existsSync(join(path, "package.json")) &&
        existsSync(join(path, "package-lock.json"))
      ) {
        packageDirs.add(path);
      }

      visit(path);
    }
  };

  visit(rootDir);
  return [...packageDirs].sort((a, b) => a.localeCompare(b));
};

const refreshLockfiles = ({ dryRun, pkg, repoRoot }) => {
  if (dryRun) {
    console.log("[dry-run] Would refresh package-lock files.");
    return;
  }

  run("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
    cwd: repoRoot,
  });

  for (const packageDir of findLockfilePackageDirs(pkg.absoluteDir)) {
    run(
      "npm",
      [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--prefix",
        packageDir,
      ],
      { cwd: repoRoot },
    );
  }
};

const runFocusedChecks = ({ dryRun, pkg, repoRoot }) => {
  for (const scriptName of ["typecheck", "test", "build", "test:e2e"]) {
    if (pkg.scripts[scriptName]) {
      run("npm", ["run", scriptName, "-w", pkg.name], {
        cwd: repoRoot,
        dryRun,
      });
    }
  }
};

export const prepareFirstRelease = async ({
  choosePackage,
  confirmYes,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repoRoot,
}) => {
  assertCleanTree(repoRoot);

  const pkg = await resolveFirstReleasePackage({
    choosePackage,
    phase: "prepare",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });
  const branchName = getBranchName(pkg, options);

  logStep(`Creating ${branchName}.`);
  run("git", ["switch", "-c", branchName], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });

  logStep(`Versioning ${pkg.name}.`);
  removeUnrelatedChangesets({ dryRun: options.dryRun, pkg, repoRoot });
  run("npx", ["changeset", "version"], {
    cwd: repoRoot,
    dryRun: options.dryRun,
    env: envWithGithubToken(repoRoot),
  });
  if (!options.dryRun) {
    assertVersionedFirstReleasePackage(pkg, { repoRoot });
  }

  logStep(`Refreshing lockfiles for ${pkg.name}.`);
  refreshLockfiles({ dryRun: options.dryRun, pkg, repoRoot });

  logStep(`Running focused checks for ${pkg.name}.`);
  runFocusedChecks({ dryRun: options.dryRun, pkg, repoRoot });
  run("git", ["status", "--short"], { cwd: repoRoot });

  if (
    options.commit &&
    (await confirmYes(
      `Commit the versioned first-release branch ${branchName} now? This runs git add and git commit locally.`,
    ))
  ) {
    run("git", ["add", "."], { cwd: repoRoot, dryRun: options.dryRun });
    run("git", ["commit", "-m", `Prepare ${pkg.name} first release`], {
      cwd: repoRoot,
      dryRun: options.dryRun,
    });
  }

  outro(`Prepared ${branchName}.`);
  note(
    `npm --prefix .changeset run first-release:dispatch -- ${pkg.name} --branch=${branchName}`,
    "When the branch is committed and clean, run",
  );
};

export const dispatchFirstRelease = async (context) =>
  runDispatchFirstRelease({
    ...context,
    helpers: {
      assertCleanTree,
      capture,
      getBranchName,
      run,
    },
  });

export const syncBackFirstRelease = async (context) =>
  runSyncBackFirstRelease({
    ...context,
    helpers: {
      assertCleanTree,
      capture,
      findLockfilePackageDirs,
      getBranchName,
      run,
    },
  });
