import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getPublicWorkspacePackages,
  resolveReleasePackage,
} from "./release-packages.mjs";

export const packageUrl = (packageName) =>
  `https://www.npmjs.com/package/${packageName}`;

// Returns the latest version currently published on npm for the package, or
// null when the package is not on npm at all. Used only for existence checks
// (the trust command decides whether to publish the 0.0.0 placeholder; dispatch
// refuses to run before trust is configured). Throws on any other npm failure
// can distinguish a clean 404 from a real registry problem.
export const getLatestPublishedVersion = (packageName) => {
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

// Returns true when a specific published version is deprecated on npm.
// Uses `npm view` (read-only, no auth). A non-deprecated version returns
// an empty string; a deprecated version returns the deprecation message.
const isVersionDeprecated = (packageName, version) => {
  const result = spawnSync(
    "npm",
    ["view", `${packageName}@${version}`, "deprecated"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  return result.status === 0 && result.stdout.trim().length > 0;
};

// Returns true when npm Trusted Publishing is configured for a package.
// Asks the registry rather than inferring it from the published version:
// packages published before this repo adopted Trusted Publishing sit at a
// real version with no trust configuration at all.
//
// `npm trust list --json` exits 0 either way. A configured package prints a
// JSON configuration; an unconfigured one prints nothing. Any non-zero exit
// (EOTP, network, rate limit) is indeterminate, not "unconfigured", so it
// throws rather than sending the caller down the placeholder-publish path blind.
//
// This check is deliberately non-interactive: capturing stdout makes npm
// refuse to prompt anyway (it errors with EOTP and the auth URL instead), so
// callers must refresh the session first via assertTrustSession. That keeps
// sweeps from stalling on a hidden prompt mid-run.
const isTrustConfigured = (packageName) => {
  const outPath = join(mkdtempSync(join(tmpdir(), "npm-trust-")), "out.json");
  const outFd = openSync(outPath, "w");

  let result;
  try {
    result = spawnSync("npm", ["trust", "list", packageName, "--json"], {
      stdio: ["ignore", outFd, "inherit"],
    });
  } finally {
    closeSync(outFd);
  }

  const stdout = readFileSync(outPath, "utf8");

  if (result.status !== 0) {
    throw new Error(
      `Could not read Trusted Publishing config for ${packageName}. If this is an OTP failure, run 'npm trust list ${packageName}' once to refresh your npm session, then retry.`,
    );
  }

  return stdout.trim().length > 0;
};

// Make sure the npm session can actually run trust commands before starting
// work that depends on them. `npm whoami` passes on a cached token that trust
// commands still reject with an OTP challenge, so this probes with a real
// trust read. Every stdio stream is inherited — npm only runs its OTP/
// browser-auth flow when it sees a terminal, which is exactly what we want:
// authenticate once, up front, and the refreshed session covers the rest of
// the run. If it still fails, surface the manual command instead of retrying.
const assertTrustSession = (packageName) => {
  const result = spawnSync("npm", ["trust", "list", packageName], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        "Your npm session cannot run trust commands right now. Refresh it by running:",
        "",
        `  npm trust list ${packageName}`,
        "",
        "then re-run this command.",
      ].join("\n"),
    );
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
      `npm login is required to configure Trusted Publishing.\n\n${whoami.stderr.trim()}`,
    );
  }

  return whoami.stdout.trim();
};

const trustGithubArgs = (pkg, repo, workflow) => [
  "trust",
  "github",
  pkg.name,
  "--repo",
  repo,
  "--file",
  workflow,
  "--allow-publish",
  // The script already asks for confirmation before touching the registry;
  // without --yes, npm trust adds its own y/n prompt per package on top.
  "--yes",
];

// Configure npm Trusted Publishing for a package. Runs `npm trust github`
// interactively: stdin/stdout are inherited so the OTP/browser-auth prompts
// work, but stderr is piped so we can inspect the error code. A 409 Conflict
// means trust is already configured for this package — treat it as success.
// Any other failure throws with the manual recovery command.
const configureTrustedPublishing = (pkg, repo, workflow) => {
  const trust = spawnSync("npm", trustGithubArgs(pkg, repo, workflow), {
    stdio: ["inherit", "inherit", "pipe"],
    encoding: "utf8",
  });

  if (trust.status === 0) {
    return;
  }

  if (/E409|409 Conflict/i.test(trust.stderr ?? "")) {
    console.log(`Trusted Publishing for ${pkg.name} is already configured.`);
    return;
  }

  const npmError = (trust.stderr ?? "").trim();
  throw new Error(
    [
      `npm trust failed for ${pkg.name}.`,
      ...(npmError ? ["", npmError] : []),
      "",
      "Run manually, then re-run this command:",
      "",
      `  npm trust github ${pkg.name} --repo ${repo} --file ${workflow} --allow-publish`,
    ].join("\n"),
  );
};

const deprecatePlaceholderArgs = (packageName) => [
  "deprecate",
  `${packageName}@0.0.0`,
  "Bootstrap placeholder release; use 0.0.1 or later.",
];

// Read-only classification of what a package needs before the release workflow
// can publish it through GitHub Actions OIDC:
//
//   - "none": published with Trusted Publishing configured. Nothing to do.
//   - "trust": published without trust — either a real release that predates
//     Trusted Publishing in this repo (published with a classic token), or an
//     already-deprecated placeholder from a prior run that died after the
//     deprecate step. Configure trust only; a real release is never deprecated.
//   - "deprecate-trust": a prior run died after publishing the 0.0.0
//     placeholder but before deprecating it. Deprecate, then configure trust.
//   - "bootstrap": never published. Publish a placeholder 0.0.0 (the real
//     dist, not an empty stub, so the throwaway version is still coherent),
//     deprecate it, and configure Trusted Publishing. npm cannot attach trust
//     to a package that does not exist, hence the placeholder. Requires the
//     manifest at 0.0.0.
//
// Nothing here mutates the registry, so a full planning sweep can run before
// any configuration happens.
const planTrust = (pkg) => {
  const published = getLatestPublishedVersion(pkg.name);

  // Only a package that has never been published needs the 0.0.0 placeholder,
  // and that path requires the manifest to be at 0.0.0. An already-published
  // package skips the publish entirely, so its manifest version is irrelevant.
  if (!published && pkg.version !== "0.0.0") {
    throw new Error(
      `${pkg.name} is at ${pkg.version} and is not on npm, but the placeholder publish expects 0.0.0.`,
    );
  }

  if (!published) {
    return { pkg, published, placeholderOnly: false, action: "bootstrap" };
  }

  // Ask the registry instead of inferring trust from the version. Packages
  // published before this repo adopted Trusted Publishing sit at a real
  // version with no trust configuration, and the old version-based check
  // reported them as already configured.
  if (isTrustConfigured(pkg.name)) {
    return { pkg, published, placeholderOnly: false, action: "none" };
  }

  const placeholderOnly = published === "0.0.0";

  return {
    pkg,
    published,
    placeholderOnly,
    action:
      placeholderOnly && !isVersionDeprecated(pkg.name, "0.0.0")
        ? "deprecate-trust"
        : "trust",
  };
};

// Perform (or dry-run print) the registry mutations a plan calls for. Assumes
// the caller has already checked the npm login and confirmed with the user.
const executeTrustPlan = (
  { action, pkg },
  { logStep, note, options, repo, run, workflow },
) => {
  if (options?.dryRun) {
    if (action === "bootstrap") {
      run("npm", ["run", "build"], { cwd: pkg.absoluteDir, dryRun: true });
      run("npm", ["publish", "--access", "public"], {
        cwd: pkg.absoluteDir,
        dryRun: true,
      });
    }
    if (action === "bootstrap" || action === "deprecate-trust") {
      run("npm", deprecatePlaceholderArgs(pkg.name), { dryRun: true });
    }
    run("npm", trustGithubArgs(pkg, repo, workflow), { dryRun: true });
    return;
  }

  if (action === "bootstrap") {
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
  }

  if (action === "bootstrap" || action === "deprecate-trust") {
    logStep(`Deprecating 0.0.0 for ${pkg.name}.`);
    const deprecate = spawnSync("npm", deprecatePlaceholderArgs(pkg.name), {
      stdio: "inherit",
    });
    if (deprecate.status !== 0) {
      note(
        `npm deprecate failed. Run manually:\nnpm deprecate ${pkg.name}@0.0.0 "Bootstrap placeholder release; use 0.0.1 or later."`,
        "Deprecate failed",
      );
    }
  }

  logStep(`Configuring npm Trusted Publishing for ${pkg.name}.`);
  configureTrustedPublishing(pkg, repo, workflow);
};

// Make a package publishable through GitHub Actions OIDC with provenance, so
// the release workflow never needs a classic npm token. See planTrust for the
// per-state breakdown of what that takes.
export const ensureTrust = async ({
  choosePackage,
  confirmYes,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repo,
  repoRoot,
  run,
  workflow,
}) => {
  const pkg = await resolveReleasePackage({
    choosePackage,
    phase: "trust",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });

  logStep("Checking the npm OTP session.");
  assertTrustSession(pkg.name);

  const plan = planTrust(pkg);
  const { action, placeholderOnly, published } = plan;

  if (action === "none") {
    note(
      `${pkg.name} is already on npm at ${published} with Trusted Publishing configured. Nothing to do.`,
      "Already configured",
    );
    return { pkg, skipped: true };
  }

  if (published) {
    note(
      placeholderOnly
        ? `${pkg.name} is on npm at 0.0.0 but Trusted Publishing is not configured. The deprecation and trust steps will run.`
        : `${pkg.name} is on npm at ${published} but Trusted Publishing is not configured. The trust step will run; ${published} is a real release and will not be deprecated.`,
      "Trusted Publishing",
    );
  }

  logStep("Checking npm login.");
  note(assertNpmLoggedIn(repoRoot), "npm user");

  const confirmMessage = options.dryRun
    ? published
      ? `Dry run: configure Trusted Publishing for ${pkg.name}?`
      : `Dry run: publish 0.0.0 for ${pkg.name}, deprecate it, and configure Trusted Publishing?`
    : published
      ? placeholderOnly
        ? `Configure npm Trusted Publishing for ${pkg.name} now?\n\nThis configures trust without re-publishing 0.0.0.`
        : `Configure npm Trusted Publishing for ${pkg.name} now?\n\n${pkg.name} is already on npm at ${published}. Nothing will be published or deprecated; this only configures Trusted Publishing so future releases can publish through the workflow.`
      : `Publish 0.0.0 for ${pkg.name} on npm, deprecate it, and configure Trusted Publishing?\n\nThis publishes a permanent but deprecated placeholder version so npm Trusted Publishing can be configured. The real release happens afterwards through the release workflow.`;

  if (!(await confirmYes(confirmMessage))) {
    throw new Error("Canceled.");
  }

  executeTrustPlan(plan, { logStep, note, options, repo, run, workflow });

  note(
    [`${packageUrl(pkg.name)}`, `npm trust list ${pkg.name}`].join("\n"),
    "Verify on npm",
  );

  outro(`Configured Trusted Publishing for ${pkg.name}.`);
  return { pkg, skipped: false };
};

// Run the trust check across every public workspace package, in two phases:
// first a read-only sweep that classifies every package, then a single batch
// at the end that configures whatever is missing behind one npm login check.
// Batching keeps the interactive npm commands (and their OTP prompts) together
// instead of interleaving them package by package through the sweep.
//
// Each package is isolated in both phases: a failure (an expired npm session
// is the likely one, since the OTP challenge can reappear part way through a
// long run) is recorded and the run continues, so one bad package does not
// hide the state of the others. The summary at the end is the point of the
// command; re-running it is safe and only touches whatever is still missing.
export const ensureTrustAll = async (context) => {
  const { confirmYes, logStep, note, options, outro, repo, repoRoot, run, workflow } =
    context;
  const packages = getPublicWorkspacePackages(repoRoot);

  if (packages.length === 0) {
    outro("No public workspace packages found.");
    return { results: [] };
  }

  logStep("Checking npm login.");
  note(assertNpmLoggedIn(repoRoot), "npm user");

  logStep("Checking the npm OTP session.");
  assertTrustSession(packages[0].name);

  const firstErrorLine = (error) =>
    (error instanceof Error ? error.message : String(error))
      .split("\n")[0]
      .trim();

  const resultsByName = new Map();
  const pending = [];

  for (const pkg of packages) {
    logStep(`Checking ${pkg.name}.`);

    try {
      const plan = planTrust(pkg);
      if (plan.action === "none") {
        resultsByName.set(pkg.name, { ok: true, detail: "already configured" });
      } else {
        pending.push(plan);
      }
    } catch (error) {
      resultsByName.set(pkg.name, { ok: false, detail: firstErrorLine(error) });
    }
  }

  // Report the read-only sweep before asking anything: what is already done,
  // what could not even be checked, and what the batch would touch.
  const alreadyConfigured = packages.filter(
    ({ name }) => resultsByName.get(name)?.ok,
  );
  const checkFailed = packages.filter(
    ({ name }) => resultsByName.has(name) && !resultsByName.get(name).ok,
  );

  if (alreadyConfigured.length > 0) {
    note(
      alreadyConfigured.map(({ name }) => `✓ ${name}`).join("\n"),
      "Already configured",
    );
  }

  if (checkFailed.length > 0) {
    note(
      checkFailed
        .map(({ name }) => `✗ ${name} — ${resultsByName.get(name).detail}`)
        .join("\n"),
      "Could not check",
    );
  }

  if (pending.length > 0) {
    note(
      pending
        .map(
          ({ action, pkg }) =>
            `${pkg.name}${action === "bootstrap" ? " (publishes a deprecated 0.0.0 placeholder first)" : ""}`,
        )
        .join("\n"),
      options?.dryRun ? "Would configure" : "Will configure",
    );

    // The sweep is read-only, so this is the last stop before anything touches
    // the registry: everything the batch will do is on screen, ask once.
    if (
      !(await confirmYes(
        options?.dryRun
          ? `Dry run: print the trust commands for these ${pending.length} packages?`
          : `Configure Trusted Publishing for these ${pending.length} packages now?`,
      ))
    ) {
      throw new Error("Canceled.");
    }

    for (const plan of pending) {
      try {
        executeTrustPlan(plan, { logStep, note, options, repo, run, workflow });
        resultsByName.set(plan.pkg.name, {
          ok: true,
          detail: options?.dryRun ? "would be configured" : "configured now",
        });
      } catch (error) {
        // The end-of-run summary only keeps the first line, which would drop
        // the recovery command — print the full error here instead.
        note(
          error instanceof Error ? error.message : String(error),
          `✗ ${plan.pkg.name}`,
        );
        resultsByName.set(plan.pkg.name, {
          ok: false,
          detail: firstErrorLine(error),
        });
      }
    }
  }

  const results = packages.map(({ name }) => ({
    name,
    ...resultsByName.get(name),
  }));

  note(
    results
      .map(({ name, ok, detail }) => `${ok ? "✓" : "✗"} ${name} — ${detail}`)
      .join("\n"),
    "Trusted Publishing",
  );

  const failed = results.filter(({ ok }) => !ok);
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${results.length} packages could not be configured. Re-run to retry just those; packages already configured are skipped.`,
    );
  }

  outro(`Trusted Publishing verified for all ${results.length} packages.`);
  return { results };
};
