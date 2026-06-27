import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  assertVersionedFirstReleasePackage,
  resolveFirstReleasePackage,
} from "./first-release-packages.mjs";
import { maybeSyncBackAfterDispatch } from "./first-release-sync-back.mjs";

const packageUrl = (packageName) =>
  `https://www.npmjs.com/package/${packageName}`;

const cleanupCommands = ({ repo }) =>
  [
    `gh secret delete NPM_TOKEN --repo ${repo}`,
    "npm token list",
    "npm token revoke <temporary-token-id>",
  ].join("\n");

const createNpmToken = ({ pkg, repoRoot, scope }) =>
  new Promise((resolve, reject) => {
    const token = spawn(
      "npm",
      [
        "token",
        "create",
        "--json",
        "--name",
        `first-release-${pkg.dir}`,
        "--expires",
        "1",
        "--scopes",
        scope,
        "--packages-and-scopes-permission",
        "read-write",
        "--bypass-2fa",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    token.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    token.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    token.on("error", reject);

    token.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Could not create temporary npm token.\n${stderr}`));
        return;
      }

      const match = stdout.match(/\bnpm_[A-Za-z0-9]+/);
      if (!match) {
        reject(new Error("Could not read npm token from npm token create output."));
        return;
      }

      resolve(match[0]);
    });
  });

const assertNpmLoggedIn = (repoRoot) => {
  const whoami = spawnSync("npm", ["whoami"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (whoami.status !== 0) {
    throw new Error(
      `npm login is required before dispatch.\n\n${whoami.stderr.trim()}`,
    );
  }

  return whoami.stdout.trim();
};

const setGithubSecret = ({ repo, repoRoot, token }) => {
  const secret = spawnSync(
    "gh",
    ["secret", "set", "NPM_TOKEN", "--repo", repo],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: token,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );

  if (secret.status !== 0) {
    throw new Error("Could not set NPM_TOKEN secret.");
  }
};

const findWorkflowRun = ({ branchName, capture, repo, repoRoot, workflow }) => {
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
      "1",
      "--json",
      "databaseId,url,status,conclusion",
      "--jq",
      ".[0] // null",
    ],
    { cwd: repoRoot },
  );

  return runJson === "null" ? null : JSON.parse(runJson);
};

const waitForWorkflowRun = ({
  branchName,
  capture,
  repo,
  repoRoot,
  workflow,
}) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = findWorkflowRun({
      branchName,
      capture,
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

export const dispatchFirstRelease = async ({
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
        : `Push ${branchName}, create a temporary npm token, dispatch ${workflow}, and watch the run for ${pkg.name}?`,
    ))
  ) {
    throw new Error("Canceled.");
  }

  const scope = pkg.name.startsWith("@") ? pkg.name.split("/")[0] : pkg.name;

  logStep("Checking npm login.");
  note(assertNpmLoggedIn(repoRoot), "npm user");

  logStep(`Pushing ${branchName}.`);
  run("git", ["push", "fujo", `${branchName}:${branchName}`], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });

  let npmToken;
  if (options.dryRun) {
    run(
      "npm",
      [
        "token",
        "create",
        "--json",
        "--name",
        `first-release-${pkg.dir}`,
        "--expires",
        "1",
        "--scopes",
        scope,
        "--packages-and-scopes-permission",
        "read-write",
        "--bypass-2fa",
      ],
      { cwd: repoRoot, dryRun: true },
    );
  } else {
    logStep("Creating temporary npm token.");
    npmToken = await createNpmToken({ pkg, repoRoot, scope });
  }

  logStep("Setting temporary NPM_TOKEN secret.");
  const secretArgs = ["secret", "set", "NPM_TOKEN", "--repo", repo];
  if (options.dryRun) {
    run("gh", secretArgs, {
      cwd: repoRoot,
      dryRun: true,
    });
  } else {
    setGithubSecret({ repo, repoRoot, token: npmToken });
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

  logStep(`Finding ${workflow} run.`);
  const workflowRun = waitForWorkflowRun({
    branchName,
    capture,
    repo,
    repoRoot,
    workflow,
  });

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
    note(
      cleanupCommands({ repo }),
      "The workflow did not complete successfully. Clean up manually when you are done debugging",
    );
    throw new Error(`${workflow} did not complete successfully.`);
  }

  note(
    [
      `gh run list --repo ${repo} --workflow ${workflow} --limit 5`,
      `npm view ${pkg.name} version`,
      `open ${packageUrl(pkg.name)}`,
    ].join("\n"),
    "Verify the publish before cleanup",
  );

  if (
    await confirmYes(
      "After checking GitHub and npm, remove the temporary NPM_TOKEN secret and revoke the npm token now?",
    )
  ) {
    try {
      logStep("Deleting temporary NPM_TOKEN secret.");
      run("gh", ["secret", "delete", "NPM_TOKEN", "--repo", repo], {
        cwd: repoRoot,
      });

      logStep("Revoking temporary npm token.");
      run("npm", ["token", "revoke", npmToken], { cwd: repoRoot });
    } catch (error) {
      note(cleanupCommands({ repo }), "Automatic cleanup failed. Run manually");
      throw error;
    }
  } else {
    note(cleanupCommands({ repo }), "Clean up later");
  }

  outro("Workflow completed.");
  note(
    `npm trust github ${pkg.name} --repo ${repo} --file release.yaml --allow-publish`,
    "If you want future publishes to use trusted publishing",
  );

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
