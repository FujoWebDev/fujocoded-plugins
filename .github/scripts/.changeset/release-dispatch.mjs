import { execFileSync, spawnSync } from "node:child_process";
import {
  assertVersionedReleasePackage,
  resolveReleasePackage,
} from "./release-packages.mjs";
import { maybeSyncBackAfterDispatch } from "./release-sync-back.mjs";
import { getLatestPublishedVersion, packageUrl } from "./release-trust.mjs";

const getWorkflowRunIdFromText = (text) =>
  text.match(
    /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/(\d+)/,
  )?.[1] ?? null;

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

// Dispatch the release workflow for a single pre-versioned package.
// The workflow publishes through GitHub Actions OIDC (Trusted Publishing), so
// no npm token or NPM_TOKEN secret is touched. Requires the package to already
// exist on npm with Trusted Publishing configured (run the trust command first
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
  remote,
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

  const published = getLatestPublishedVersion(pkg.name);
  if (!published) {
    throw new Error(
      `${pkg.name} is not on npm yet. Run the trust command first to publish 0.0.0 and configure Trusted Publishing.`,
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
  run("git", ["push", remote, `${branchName}:${branchName}`], {
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
    `mode=single-package`,
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
