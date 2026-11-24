import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertVersionedReleasePackage,
  getPendingChangesets,
  resolveReleasePackage,
} from "./release-packages.mjs";
import { dispatchRelease as runDispatchRelease } from "./release-dispatch.mjs";
import {
  ensureTrustAll as runEnsureTrustAll,
  ensureTrust as runEnsureTrust,
} from "./release-trust.mjs";
import { syncBackRelease as runSyncBackRelease } from "./release-sync-back.mjs";

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
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }

    dir = dirname(dir);
  }

  throw new Error("Could not find repo root (no pnpm-workspace.yaml).");
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
  options.branch ?? `release/${pkg.dir}-${pkg.version}`;

const validateSinglePackagePrepare = ({ pkg, repoRoot }) => {
  if (!existsSync(join(repoRoot, ".changeset/pre.json"))) {
    return;
  }

  const selectedChangesets = new Set(pkg.changesetFiles);
  const siblingChangesets = getPendingChangesets(repoRoot).filter(
    (file) => !selectedChangesets.has(file),
  );

  if (siblingChangesets.length > 0) {
    throw new Error(
      `Single-package prepare is not allowed in pre mode with sibling pending changesets: ${siblingChangesets.join(", ")}. ` +
        `Either convert to a full prerelease (version all packages) or exit pre mode first.`,
    );
  }
};

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

// One lockfile covers packages and examples.
const refreshLockfile = ({ dryRun, repoRoot }) => {
  run("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], {
    cwd: repoRoot,
    dryRun,
  });
};

const runFocusedChecks = ({ dryRun, pkg, repoRoot }) => {
  for (const scriptName of ["typecheck", "test", "build", "test:e2e"]) {
    if (pkg.scripts[scriptName]) {
      run("pnpm", ["--filter", pkg.name, "run", scriptName], {
        cwd: repoRoot,
        dryRun,
      });
    }
  }
};

export const prepareRelease = async ({
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

  const pkg = await resolveReleasePackage({
    choosePackage,
    phase: "prepare",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });

  // Guard before branch creation so a throw never leaves a half-created
  // branch. After this point removeUnrelatedChangesets can delete freely.
  validateSinglePackagePrepare({ pkg, repoRoot });

  // If --branch is explicit, use it as-is and skip the temp-branch/rename
  // dance. Otherwise create a temp branch, version, then rename to the
  // final release/<pkg>-<version> name once we know the post-version value.
  const explicitBranch = options.branch;
  const tempBranchName = explicitBranch ?? `release/${pkg.dir}`;

  logStep(`Creating ${tempBranchName}.`);
  run("git", ["switch", "-c", tempBranchName], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });

  logStep(`Versioning ${pkg.name}.`);
  removeUnrelatedChangesets({ dryRun: options.dryRun, pkg, repoRoot });
  run("pnpm", ["exec", "changeset", "version"], {
    cwd: repoRoot,
    dryRun: options.dryRun,
    env: envWithGithubToken(repoRoot),
  });
  // Re-read the manifest to get the post-version version, then rename the
  // temp branch to release/<pkg>-<version>. Skip the rename for --dry-run
  // (no branch exists) or when --branch was explicit (no temp branch).
  let branchName = tempBranchName;
  if (!options.dryRun && !explicitBranch) {
    const versionedPkg = {
      ...pkg,
      version: readJson(join(pkg.absoluteDir, "package.json")).version,
    };
    branchName = getBranchName(versionedPkg, options);
    if (branchName !== tempBranchName) {
      logStep(`Renaming ${tempBranchName} → ${branchName}.`);
      run("git", ["branch", "-m", branchName], { cwd: repoRoot });
    }
  }

  if (!options.dryRun) {
    assertVersionedReleasePackage(pkg, { repoRoot });
  }

  logStep(`Refreshing the lockfile for ${pkg.name}.`);
  refreshLockfile({ dryRun: options.dryRun, repoRoot });

  logStep(`Running focused checks for ${pkg.name}.`);
  runFocusedChecks({ dryRun: options.dryRun, pkg, repoRoot });
  run("git", ["status", "--short"], { cwd: repoRoot });

  if (
    options.commit &&
    (await confirmYes(
      `Commit the versioned release branch ${branchName} now? This runs git add and git commit locally.`,
    ))
  ) {
    run("git", ["add", "."], { cwd: repoRoot, dryRun: options.dryRun });
    run("git", ["commit", "-m", `Prepare ${pkg.name} release`], {
      cwd: repoRoot,
      dryRun: options.dryRun,
    });
  }

  outro(`Prepared ${branchName}.`);
  note(
    `pnpm --dir .changeset run release:dispatch ${pkg.name} --branch=${branchName}`,
    "When the branch is committed and clean, run",
  );
};

export const dispatchRelease = async (context) =>
  runDispatchRelease({
    ...context,
    helpers: {
      assertCleanTree,
      capture,
      getBranchName,
      run,
    },
  });

export const ensureTrust = async (context) =>
  runEnsureTrust({
    ...context,
    run,
  });

export const ensureTrustAll = async (context) =>
  runEnsureTrustAll({
    ...context,
    run,
  });

export const syncBackRelease = async (context) =>
  runSyncBackRelease({
    ...context,
    helpers: {
      assertCleanTree,
      capture,
      getBranchName,
      run,
    },
  });
