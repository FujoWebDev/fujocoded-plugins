import { execFileSync, spawnSync } from "node:child_process";
import {
  assertVersionedReleasePackage,
  resolveReleasePackage,
} from "./release-packages.mjs";
import { maybeSyncBackAfterDispatch } from "./release-sync-back.mjs";

const packageUrl = (packageName) =>
  `https://www.npmjs.com/package/${packageName}`;

const getWorkflowRunIdFromText = (text) =>
  text.match(
    /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/(\d+)/,
  )?.[1] ?? null;

// Returns the published version string, or null when the package is not on npm.
// Throws on any other npm failure so callers can distinguish 404 from a real
// registry problem.
const getPublishedVersion = (packageName) => {
  const result = spawnSync("npm", ["view", packageName, "version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    return result.stdout.trim() || null;
  }

  const combined = `${result.stderr}\n${result.stdout}`;
  if (/E404|404 Not Found/i.test(combined)) {
    return null;
  }

  throw new Error(
    `Could not check npm for ${packageName}:\n${combined.trim()}`,
  );
};

const assertNpmLoggedIn = (repoRoot) => {
  const whoami = spawnSync("npm", ["whoami"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (whoami.status !== 0) {
    throw new Error(
      `npm login is required before bootstrapping.\n\n${whoami.stderr.trim()}`,
    );
  }

  return whoami.stdout.trim();
};

// Publish a placeholder 0.0.0 for a brand-new package, deprecate it, and
// configure npm Trusted Publishing so future publishes go through GitHub
// Actions OIDC with provenance. This is the one-time bootstrap that makes the
// single-package release workflow able to publish without a classic npm token.
//
// The package must already be at version 0.0.0 in its package.json. We publish
// the real dist (the build output), not an empty package, so the placeholder is
// a usable if throwaway version rather than a broken stub.
export const bootstrapRelease = async ({
  confirmYes,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repo,
  repoRoot,
  run,
}) => {
  const pkg = await resolveReleasePackage({
    phase: "prepare",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });

  if (pkg.version !== "0.0.0") {
    throw new Error(
      `${pkg.name} is at ${pkg.version}, but bootstrap expects 0.0.0. Bootstrap only runs for packages that have never been published.`,
    );
  }

  const published = getPublishedVersion(pkg.name);
  if (published) {
    note(
      `${pkg.name} is already on npm at ${published}. Bootstrap is not needed.`,
      "Skip bootstrap",
    );
    return { pkg, skipped: true };
  }

  logStep("Checking npm login.");
  note(assertNpmLoggedIn(repoRoot), "npm user");

  if (
    !(await confirmYes(
      options.dryRun
        ? `Dry run: publish 0.0.0 for ${pkg.name}, deprecate it, and configure Trusted Publishing?`
        : `Publish 0.0.0 for ${pkg.name} on npm, deprecate it, and configure Trusted Publishing?\n\nThis publishes a permanent but deprecated placeholder version so npm Trusted Publishing can be configured. The real release happens afterwards through the release-package workflow.`,
    ))
  ) {
    throw new Error("Canceled.");
  }

  if (!options.dryRun) {
    logStep(`Building ${pkg.name}.`);
    const build = spawnSync("npm", ["run", "build"], {
      cwd: pkg.absoluteDir,
      stdio: "inherit",
    });
    if (build.status !== 0) {
      throw new Error(`Build failed for ${pkg.name}.`);
    }

    logStep(`Publishing 0.0.0 for ${pkg.name}.`);
    const publish = spawnSync("npm", ["publish", "--access", "public"], {
      cwd: pkg.absoluteDir,
      stdio: "inherit",
    });
    if (publish.status !== 0) {
      throw new Error(`Could not publish 0.0.0 for ${pkg.name}.`);
    }

    logStep(`Deprecating 0.0.0 for ${pkg.name}.`);
    const deprecate = spawnSync(
      "npm",
      [
        "deprecate",
        `${pkg.name}@0.0.0`,
        "Bootstrap placeholder release; use 0.0.1 or later.",
      ],
      { stdio: "inherit" },
    );
    if (deprecate.status !== 0) {
      note(
        `npm deprecate failed. Run manually:\nnpm deprecate ${pkg.name}@0.0.0 "Bootstrap placeholder release; use 0.0.1 or later."`,
        "Deprecate failed",
      );
    }

    logStep("Configuring npm Trusted Publishing.");
    const trust = spawnSync(
      "npm",
      [
        "trust",
        "github",
        pkg.name,
        "--repo",
        repo,
        "--file",
        "release.yaml",
        "--allow-publish",
      ],
      { stdio: "inherit" },
    );
    if (trust.status !== 0) {
      note(
        `npm trust failed. Run manually:\nnpm trust github ${pkg.name} --repo ${repo} --file release.yaml --allow-publish`,
        "Trust failed",
      );
    }
  } else {
    run("npm", ["run", "build"], { cwd: pkg.absoluteDir, dryRun: true });
    run("npm", ["publish", "--access", "public"], {
      cwd: pkg.absoluteDir,
      dryRun: true,
    });
    run(
      "npm",
      [
        "deprecate",
        `${pkg.name}@0.0.0`,
        "Bootstrap placeholder release; use 0.0.1 or later.",
      ],
      { dryRun: true },
    );
    run(
      "npm",
      [
        "trust",
        "github",
        pkg.name,
        "--repo",
        repo,
        "--file",
        "release.yaml",
        "--allow-publish",
      ],
      { dryRun: true },
    );
  }

  note(
    [`${packageUrl(pkg.name)}`, `npm trust list ${pkg.name}`].join("\n"),
    "Verify on npm",
  );

  outro(`Bootstrapped ${pkg.name}.`);
  return { pkg, skipped: false };
};

const findWorkflowRun = ({
  branchName,
  capture,
  ignoredRunIds = new Set(),
  repo,
  repoRoot,
  workflow,
}) => {
  const runJson = capture(
    "gh",
    [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      workflow,
      "--branch",
      branchName,
      "--event",
      "workflow_dispatch",
      "--limit",
      "5",
      "--json",
      "databaseId,url,status,conclusion",
    ],
    { cwd: repoRoot },
  );

  const runs = JSON.parse(runJson);
  return runs.find((run) => !ignoredRunIds.has(run.databaseId)) ?? null;
};

const waitForWorkflowRun = ({
  branchName,
  capture,
  ignoredRunIds,
  repo,
  repoRoot,
  workflow,
}) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = findWorkflowRun({
      branchName,
      capture,
      ignoredRunIds,
      repo,
      repoRoot,
      workflow,
    });
    if (run) {
      return run;
    }

    execFileSync("sleep", ["3"]);
  }

  throw new Error(`Could not find a ${workflow} run for ${branchName}.`);
};

// Dispatch the release-package workflow for a single pre-versioned package.
// The workflow publishes through GitHub Actions OIDC (Trusted Publishing), so
// no npm token or NPM_TOKEN secret is touched. Requires the package to already
// exist on npm with Trusted Publishing configured (run bootstrap first for a
// brand-new package).
export const dispatchRelease = async ({
  choosePackage,
  confirmYes,
  helpers,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repo,
  repoRoot,
  workflow,
}) => {
  const { assertCleanTree, capture, getBranchName, run } = helpers;

  if (!options.allowDirty) {
    assertCleanTree(repoRoot);
  } else {
    note(
      "Skipping working-tree cleanliness check due --allow-dirty.",
      "Dispatch note",
    );
  }

  const pkg = await resolveReleasePackage({
    choosePackage,
    phase: "dispatch",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });
  const branchName = getBranchName(pkg, options);

  logStep(`Checking ${pkg.name} on ${branchName}.`);
  assertVersionedReleasePackage(pkg, { repoRoot });

  const currentBranch = capture("git", ["branch", "--show-current"], {
    cwd: repoRoot,
  });
  if (currentBranch !== branchName) {
    throw new Error(
      `Current branch is ${currentBranch}; expected ${branchName}.`,
    );
  }

  const published = getPublishedVersion(pkg.name);
  if (!published) {
    throw new Error(
      `${pkg.name} is not on npm yet. Run the bootstrap command first to publish 0.0.0 and configure Trusted Publishing.`,
    );
  }

  if (
    !(await confirmYes(
      options.dryRun
        ? `Dry run: validate ${branchName} and show dispatch commands for ${pkg.name}?`
        : `Push ${branchName} and dispatch ${workflow} to publish ${pkg.name}@${pkg.version} via Trusted Publishing?`,
    ))
  ) {
    throw new Error("Canceled.");
  }

  logStep(`Pushing ${branchName}.`);
  run("git", ["push", "fujo", `${branchName}:${branchName}`], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });

  logStep(`Dispatching ${workflow} for ${pkg.name}.`);
  const existingWorkflowRuns = JSON.parse(
    capture(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        workflow,
        "--branch",
        branchName,
        "--event",
        "workflow_dispatch",
        "--limit",
        "20",
        "--json",
        "databaseId",
      ],
      { cwd: repoRoot },
    ),
  );
  const existingWorkflowRunIds = new Set(
    existingWorkflowRuns.map((run) => run.databaseId),
  );
  const workflowDispatchArgs = [
    "workflow",
    "run",
    workflow,
    "--repo",
    repo,
    "--ref",
    branchName,
    "--raw-field",
    `package_name=${pkg.name}`,
  ];
  if (options.dryRun) {
    run("gh", workflowDispatchArgs, { cwd: repoRoot, dryRun: true });
    run(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        workflow,
        "--branch",
        branchName,
        "--event",
        "workflow_dispatch",
        "--limit",
        "1",
      ],
      { cwd: repoRoot, dryRun: true },
    );
    run("gh", ["run", "watch", "<run-id>", "--repo", repo, "--exit-status"], {
      cwd: repoRoot,
      dryRun: true,
    });

    await maybeSyncBackAfterDispatch({
      confirmYes,
      helpers,
      logStep,
      note,
      options,
      pkg,
      repoRoot,
      sourceBranch: branchName,
    });

    outro("Dry run complete.");
    return;
  }

  const workflowDispatch = spawnSync("gh", workflowDispatchArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (workflowDispatch.status !== 0) {
    throw new Error("Could not dispatch workflow.");
  }

  if (workflowDispatch.stdout.trim()) {
    note(workflowDispatch.stdout.trim(), "Workflow run");
  }

  const dispatchedRunId = getWorkflowRunIdFromText(workflowDispatch.stdout);
  let workflowRun;

  if (dispatchedRunId) {
    workflowRun = JSON.parse(
      capture(
        "gh",
        [
          "run",
          "view",
          dispatchedRunId,
          "--repo",
          repo,
          "--json",
          "databaseId,url,status,conclusion",
        ],
        { cwd: repoRoot },
      ),
    );
  } else {
    logStep(`Finding ${workflow} run.`);
    workflowRun = waitForWorkflowRun({
      branchName,
      capture,
      ignoredRunIds: existingWorkflowRunIds,
      repo,
      repoRoot,
      workflow,
    });
  }

  note(workflowRun.url, "GitHub Actions run");

  logStep(`Watching ${workflow} run.`);
  const watch = spawnSync(
    "gh",
    [
      "run",
      "watch",
      String(workflowRun.databaseId),
      "--repo",
      repo,
      "--exit-status",
      "--compact",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  note(
    [workflowRun.url, packageUrl(pkg.name)].join("\n"),
    "Check the GitHub run and npm package",
  );

  if (watch.status !== 0) {
    throw new Error(`${workflow} did not complete successfully.`);
  }

  note(
    [
      `gh run list --repo ${repo} --workflow ${workflow} --limit 5`,
      `npm view ${pkg.name} version`,
      `open ${packageUrl(pkg.name)}`,
    ].join("\n"),
    "Verify the publish",
  );

  outro("Workflow completed.");

  await maybeSyncBackAfterDispatch({
    confirmYes,
    helpers,
    logStep,
    note,
    options,
    pkg,
    repoRoot,
    sourceBranch: branchName,
  });
};
