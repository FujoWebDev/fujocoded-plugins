#!/usr/bin/env node
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cancel,
  confirm,
  isCancel,
  log,
  note,
  outro,
  select,
} from "@clack/prompts";
import { Command } from "commander";
import {
  ensureTrustAll,
  ensureTrust,
  dispatchRelease,
  findRepoRoot,
  prepareRelease,
  syncBackRelease,
} from "./release-runner.mjs";

const repo = "FujoWebDev/fujocoded-plugins";
const workflow = "release.yaml";
const defaultRemote = "origin";
const scriptDir = dirname(fileURLToPath(import.meta.url));

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const fail = (error) => {
  console.error(getErrorMessage(error));
  process.exit(1);
};

let repoRoot;
try {
  repoRoot = findRepoRoot(scriptDir);
} catch (error) {
  fail(error);
}
process.chdir(repoRoot);

const promptChoice = async (question, choices) => {
  const answer = await select({
    message: question,
    options: choices,
  });

  if (isCancel(answer)) {
    cancel("Canceled.");
    process.exit(1);
  }

  return answer;
};

const choosePackage = ({ candidates, message }) =>
  promptChoice(
    message,
    candidates.map((pkg) => ({
      label: pkg.name,
      hint: `${pkg.dir}${
        pkg.changesetFiles ? ` via ${pkg.changesetFiles.join(", ")}` : ""
      }`,
      value: pkg,
    })),
  );

const confirmYes = async (message) => {
  const answer = await confirm({ message });

  if (isCancel(answer)) {
    cancel("Canceled.");
    process.exit(1);
  }

  return answer;
};

const commandContext = {
  choosePackage,
  confirmYes,
  logStep: log.step,
  note,
  outro,
  repoRoot,
};

const runCommand =
  (command, context = {}) =>
  async (packageNameOrDir, options) => {
    try {
      await command({
        ...commandContext,
        ...context,
        options,
        packageNameOrDir,
      });
    } catch (error) {
      fail(error);
    }
  };

const prepare = runCommand(prepareRelease);

const dispatch = runCommand(
  async (context) =>
    dispatchRelease({
      ...context,
      remote: context.options.remote ?? defaultRemote,
    }),
  {
    repo,
    workflow,
  },
);

const syncBack = runCommand(syncBackRelease);

const trust = runCommand(
  async (context) => {
    if (!context.options.all) {
      return await ensureTrust(context);
    }

    return await ensureTrustAll(context);
  },
  {
    repo,
    workflow,
  },
);

// The release command checks whether the package needs a first-publish
// trust setup (publish 0.0.0 if new, deprecate it, configure Trusted Publishing),
// runs that if needed, then asks whether to release the package immediately
// through the single-package workflow or leave it for the normal main-merge
// flow.
const release = async (packageNameOrDir, options) => {
  try {
    const { skipped, pkg } = await ensureTrust({
      ...commandContext,
      repo,
      workflow,
      options,
      packageNameOrDir,
    });

    const prompt = skipped
      ? `${pkg.name} is already on npm. Release just this package now through the single-package workflow?`
      : `Trusted Publishing configured for ${pkg.name}. Version it and dispatch the single-package release now?`;

    const proceed = await confirmYes(prompt);
    if (!proceed) {
      note(
        [
          `The normal release flow will publish ${pkg.name} when its changeset lands on main.`,
          `To release just this package later:`,
          `  npm --prefix .changeset run release:prepare -- ${pkg.name} --commit`,
          `  npm --prefix .changeset run release:dispatch -- ${pkg.name}`,
        ].join("\n"),
        "Left for normal flow",
      );
      return;
    }

    await prepareRelease({
      ...commandContext,
      options: { ...options, commit: true },
      packageNameOrDir,
    });

    await dispatchRelease({
      ...commandContext,
      remote: options.remote ?? defaultRemote,
      repo,
      workflow,
      options,
      packageNameOrDir,
    });
  } catch (error) {
    fail(error);
  }
};

const program = new Command();

program
  .name("release")
  .description(
    "Configure Trusted Publishing, version, and release one workspace package at a time.",
  );

program
  .command("release")
  .description(
    "Configure Trusted Publishing if needed, then release the package through the single-package workflow.",
  )
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--branch <branch>", "branch name to create")
  .option(
    "--target <branch>",
    "branch to sync release state back to after publish",
  )
  .option("--commit", "prompt for a local commit after preparing")
  .option(
    "--allow-dirty",
    "allow running dispatch with an uncommitted working tree",
  )
  .option("--remote <remote>", "git remote to push the release branch to", defaultRemote)
  .option("--dry-run", "show planned operations without applying changes")
  .action(release);

program
  .command("trust")
  .alias("bootstrap")
  .description(
    "Configure npm Trusted Publishing for a package, publishing a 0.0.0 placeholder first if it has never been published.",
  )
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--dry-run", "show planned operations without applying changes")
  .option(
    "--all",
    "check every public package and configure the ones missing Trusted Publishing",
  )
  .hook("preAction", (thisCommand, actionCommand) => {
    if (actionCommand.opts().all && actionCommand.args.length > 0) {
      actionCommand.error(
        "error: option '--all' cannot be used with a package name",
      );
    }
  })
  .action(trust);

program
  .command("prepare")
  .description("Create a versioned release branch for one package.")
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--branch <branch>", "branch name to create")
  .option("--commit", "prompt for a local commit after preparing")
  .option("--dry-run", "show planned operations without applying changes")
  .action(prepare);

program
  .command("dispatch")
  .description("Push and dispatch the release workflow for one package.")
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--branch <branch>", "branch name to require")
  .option(
    "--allow-dirty",
    "allow running dispatch with an uncommitted working tree",
  )
  .option(
    "--target <branch>",
    "branch to sync release state back to after publish",
  )
  .option("--commit", "prompt for a local sync-back commit after publishing")
  .option("--remote <remote>", "git remote to push the release branch to", defaultRemote)
  .option("--dry-run", "show planned operations without applying changes")
  .action(dispatch);

program
  .command("sync-back")
  .description(
    "Apply only the published release package state back to another branch.",
  )
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .requiredOption("--target <branch>", "branch to update")
  .option("--branch <branch>", "release branch name to require")
  .option("--commit", "prompt for a local commit after syncing")
  .option("--dry-run", "show planned operations without applying changes")
  .action(syncBack);

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  await program.parseAsync();
}
