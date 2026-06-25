import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertVersionedFirstReleasePackage,
  getPendingChangesets,
  resolveFirstReleasePackage,
} from "./first-release-packages.mjs";

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

const removeUnrelatedChangesets = ({ pkg, repoRoot, dryRun }) => {
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

      const path = join(dir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }

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

const refreshLockfiles = ({ pkg, repoRoot, dryRun }) => {
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

const runFocusedChecks = ({ pkg, repoRoot, dryRun }) => {
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
  refreshLockfiles({
    dryRun: options.dryRun,
    pkg,
    repoRoot,
  });

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

export const dispatchFirstRelease = async ({
  choosePackage,
  confirmYes,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repo,
  repoRoot,
  workflow,
}) => {
  assertCleanTree(repoRoot);

  const pkg = await resolveFirstReleasePackage({
    choosePackage,
    phase: "dispatch",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });
  const branchName = getBranchName(pkg, options);

  logStep(`Checking ${pkg.name} on ${branchName}.`);
  assertVersionedFirstReleasePackage(pkg, { repoRoot });

  const currentBranch = capture("git", ["branch", "--show-current"], {
    cwd: repoRoot,
  });
  if (currentBranch !== branchName) {
    throw new Error(
      `Current branch is ${currentBranch}; expected ${branchName}.`,
    );
  }

  if (
    !(await confirmYes(
      options.dryRun
        ? `Dry run: validate ${branchName} and show dispatch commands for ${pkg.name}?`
        : `Push ${branchName}, set the NPM_TOKEN GitHub secret, and dispatch ${workflow} for ${pkg.name}?`,
    ))
  ) {
    throw new Error("Canceled.");
  }

  const scope = pkg.name.startsWith("@") ? pkg.name.split("/")[0] : pkg.name;

  note(
    `npm token create --name "first-package-release" --expires 1 --scopes ${scope} --packages-and-scopes-permission read-write --bypass-2fa`,
    "Create a temporary npm token in another terminal if needed",
  );

  logStep(`Pushing ${branchName}.`);
  run("git", ["push", "fujo", `${branchName}:${branchName}`], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });

  logStep("Setting temporary NPM_TOKEN secret.");
  const secretArgs = ["secret", "set", "NPM_TOKEN", "--repo", repo];
  if (options.dryRun) {
    run("gh", secretArgs, {
      cwd: repoRoot,
      dryRun: true,
    });
  } else {
    const secret = spawnSync("gh", secretArgs, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (secret.status !== 0) {
      throw new Error("Could not set NPM_TOKEN secret.");
    }
  }

  logStep(`Dispatching ${workflow} for ${pkg.name}.`);
  const workflowDispatchArgs = [
    "workflow",
    "run",
    workflow,
    "--repo",
    repo,
    "--ref",
    branchName,
    "--field",
    `package_name=${pkg.name}`,
  ];
  if (options.dryRun) {
    run("gh", workflowDispatchArgs, { cwd: repoRoot, dryRun: true });
  } else {
    const workflowDispatch = spawnSync("gh", workflowDispatchArgs, {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (workflowDispatch.status !== 0) {
      throw new Error("Could not dispatch workflow.");
    }
  }

  outro(options.dryRun ? "Dry run complete." : "Workflow dispatched.");
  note(`gh run list --repo ${repo} --workflow ${workflow}`, "Watch it with");
  note(
    [
      `npm trust github ${pkg.name} --repo ${repo} --file release.yaml --allow-publish`,
      `gh secret delete NPM_TOKEN --repo ${repo}`,
      "npm token revoke <token-id-or-token>",
    ].join("\n"),
    "After a successful publish",
  );
};
