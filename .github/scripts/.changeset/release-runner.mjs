import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertVersionedReleasePackage,
  getPendingChangesets,
  resolveReleasePackage,
} from "./release-packages.mjs";
import {
  bootstrapRelease as runBootstrapRelease,
  dispatchRelease as runDispatchRelease,
} from "./release-dispatch.mjs";
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

// npm provenance verification requires the package.json repository.url to
// resolve to the same GitHub repo that the workflow runs in. npm normalizes
// `git+https://github.com/Owner/Repo.git` → `https://github.com/Owner/Repo`
// for comparison, but the owner/repo casing must match exactly. A mismatch
// causes publish to fail with E422 after the workflow already ran.
const normalizeRepositoryUrl = (url) =>
  url.replace(/^git\+/, "").replace(/\.git$/, "");

const validateRepositoryUrl = ({ pkg, repo }) => {
  const expected = `https://github.com/${repo}`;
  const raw =
    typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;

  if (!raw) {
    throw new Error(
      `${pkg.name} has no repository field in package.json. Provenance publishing requires it to be "${expected}".`,
    );
  }

  const normalized = normalizeRepositoryUrl(raw);
  if (normalized !== expected) {
    throw new Error(
      `${pkg.name} repository.url is "${raw}" (normalized: "${normalized}"), but provenance expects "${expected}". Fix the repository.url in package.json before releasing.`,
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

export const prepareRelease = async ({
  choosePackage,
  confirmYes,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repo,
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

  if (repo) {
    validateRepositoryUrl({ pkg, repo });
  }

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
  run("npx", ["changeset", "version"], {
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

  logStep(`Refreshing lockfiles for ${pkg.name}.`);
  refreshLockfiles({ dryRun: options.dryRun, pkg, repoRoot });

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
    `npm --prefix .changeset run release:dispatch -- ${pkg.name} --branch=${branchName}`,
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

export const bootstrapRelease = async (context) =>
  runBootstrapRelease({
    ...context,
    run,
  });

export const syncBackRelease = async (context) =>
  runSyncBackRelease({
    ...context,
    helpers: {
      assertCleanTree,
      capture,
      findLockfilePackageDirs,
      getBranchName,
      run,
    },
  });
