import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { isCancel, password } from "@clack/prompts";
import {
  assertVersionedFirstReleasePackage,
  resolveFirstReleasePackage,
} from "./first-release-packages.mjs";
import { maybeSyncBackAfterDispatch } from "./first-release-sync-back.mjs";

const require = createRequire(import.meta.url);
const { webAuthOpener } = require("npm-profile");

const packageUrl = (packageName) =>
  `https://www.npmjs.com/package/${packageName}`;

const getWorkflowRunIdFromText = (text) =>
  text.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/(\d+)/)
    ?.[1] ?? null;

const cleanupCommands = ({ repo }) =>
  [
    `gh secret delete NPM_TOKEN --repo ${repo}`,
    "npm token list",
    "npm token revoke <temporary-token-id>",
  ].join("\n");

const getOtpUrls = (text) => {
  if (!text) {
    return { authUrl: null, doneUrl: null };
  }

  const authMatch = text.match(
    /https:\/\/www\.npmjs\.com\/auth\/cli\/[A-Za-z0-9-]+/i,
  );
  const doneMatch = text.match(
    /https:\/\/registry\.npmjs\.org\/-\/v1\/done\?authId=[A-Za-z0-9-]+/i,
  );

  return {
    authUrl: authMatch?.[0] ?? null,
    doneUrl: doneMatch?.[0] ?? null,
  };
};

const parseTokenCreateFailure = (text) => {
  const { authUrl, doneUrl } = getOtpUrls(text);

  if (text.includes("EOTP") || text.includes("one-time password")) {
    return {
      message: "EOTP required",
      authUrl,
      doneUrl,
    };
  }

  return null;
};

const readNpmToken = (stdout) => {
  const trimmed = stdout.trim();

  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.token === "string" && parsed.token.startsWith("npm_")) {
        return parsed.token;
      }
    } catch {
      // Fall back to scanning stdout below.
    }
  }

  return stdout.match(/\bnpm_[A-Za-z0-9_-]+/)?.[0] ?? null;
};

const openAuthUrl = (authUrl) => {
  if (!authUrl || process.platform !== "darwin") {
    return false;
  }

  const opened = spawnSync("open", [authUrl], {
    stdio: "ignore",
  });

  return opened.status === 0;
};

const waitForWebOtp = async ({ authUrl, doneUrl, note }) => {
  if (!authUrl || !doneUrl) {
    return null;
  }

  const opener = async (url, { signal } = {}) => {
    signal?.throwIfAborted();
    const opened = openAuthUrl(url);
    note(
      [
        opened
          ? `Opened npm browser authentication: ${url}`
          : `Open npm browser authentication: ${url}`,
        "Waiting for npm browser authentication to complete.",
      ].join("\n"),
      "npm browser authentication",
    );
  };

  const { token } = await webAuthOpener(opener, authUrl, doneUrl, {
    registry: "https://registry.npmjs.org",
  });

  return token;
};

const askOtp = async () => {
  const oneTimePassword = await password({
    message: "Enter npm one-time password (6 digits)",
  });

  if (isCancel(oneTimePassword)) {
    throw new Error("Token creation canceled.");
  }

  return oneTimePassword;
};

const askPassword = async () => {
  const npmPassword = await password({
    message: "Enter npm password",
  });

  if (isCancel(npmPassword)) {
    throw new Error("Token creation canceled.");
  }

  return npmPassword;
};

const createNpmToken = ({
  pkg,
  repoRoot,
  scope,
  otp,
  password: providedPassword,
}) =>
  new Promise((resolve, reject) => {
    const tokenName = `first-release-${pkg.dir}-${Date.now()}`;
    const args = [
      "token",
      "create",
      "--json",
      "--name",
      tokenName,
      "--expires",
      "1",
      "--scopes",
      scope,
      "--packages-and-scopes-permission",
      "read-write",
      "--bypass-2fa",
    ];

    if (scope.startsWith("@")) {
      args.push(
        "--orgs",
        scope.slice(1),
        "--orgs-permission",
        "read-write",
      );
    }

    if (otp) {
      args.push("--otp", String(otp));
    }

    if (providedPassword) {
      args.push("--password", String(providedPassword));
    }

    const token = spawn(
      "npm",
      args,
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
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

    token.on("error", (error) => {
      reject(error);
    });

    token.on("close", async (code) => {
      if (code !== 0) {
        const parsed = parseTokenCreateFailure([stdout, stderr].join("\n"));
        if (parsed) {
          const error = new Error(parsed.message);
          error.code = "EOTP";
          error.authUrl = parsed.authUrl;
          error.doneUrl = parsed.doneUrl;
          reject(error);
          return;
        }

        reject(new Error(`Could not create temporary npm token.\n${stderr}`));
        return;
      }

      const npmToken = readNpmToken(stdout);
      if (!npmToken) {
        reject(new Error("Could not read npm token from npm token create output."));
        return;
      }

      resolve(npmToken);
    });
  });

const createTokenWithRetryOnOtp = async ({
  confirmYes,
  note,
  pkg,
  repoRoot,
  scope,
  options,
}) => {
  let cachedPassword = options.password || process.env.NPM_PASSWORD;
  let retriedAfterBrowserFlow = false;

  if (!cachedPassword) {
    if (!process.stdin.isTTY) {
      throw new Error(
        "Could not prompt for npm password in non-interactive mode.\nSet NPM_PASSWORD before running first-release:dispatch.",
      );
    }
    cachedPassword = await askPassword();
  }

  const retryWithOtp = async (otp) => {
    return createNpmToken({
      pkg,
      repoRoot,
      scope,
      otp,
      password: cachedPassword,
    });
  };

  let oneTimePassword = options.otp || process.env.NPM_OTP;
  while (true) {
    try {
      return await retryWithOtp(oneTimePassword);
    } catch (error) {
      const isEotp =
        error?.code === "EOTP" ||
        (typeof error?.message === "string" &&
          error.message.includes("This operation requires a one-time password"));

      if (!isEotp) {
        throw error;
      }

      const authHintLines = [
        error.authUrl ? `Open this URL to authenticate: ${error.authUrl}` : null,
        error.doneUrl
          ? "The script will poll npm's done URL automatically after browser authentication."
          : null,
      ].filter(Boolean);

      const nextSteps = [
        ...authHintLines,
        "If authentication supports classic OTP, enter it below and retry automatically.",
      ].filter(Boolean);

      note(nextSteps.join("\n"), "npm requires one-time authentication");

      if (
        !options.otp &&
        !process.env.NPM_OTP &&
        authHintLines.length > 0 &&
        !retriedAfterBrowserFlow
      ) {
        if (
          await confirmYes(
            "Open browser authentication and retry token create after it completes?",
          )
        ) {
          const webOtp = await waitForWebOtp({
            authUrl: error.authUrl,
            doneUrl: error.doneUrl,
            note,
          });
          oneTimePassword = webOtp ?? undefined;
          retriedAfterBrowserFlow = true;
          continue;
        }
      }

      if (!options.otp && !process.env.NPM_OTP) {
        if (!(await confirmYes("Retry token create using an OTP?"))) {
          throw error;
        }

        oneTimePassword = await askOtp();
        continue;
      }

      throw error;
    }
  }
};

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

  if (!options.allowDirty) {
    assertCleanTree(repoRoot);
  } else {
    note(
      "Skipping working-tree cleanliness check due --allow-dirty.",
      "Dispatch note",
    );
  }

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
    npmToken = await createTokenWithRetryOnOtp({
      confirmYes,
      note,
      pkg,
      repoRoot,
      scope,
      options,
    });
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
