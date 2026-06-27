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
  bootstrapRelease,
  dispatchRelease,
  findRepoRoot,
  prepareRelease,
  syncBackRelease,
} from "./release-runner.mjs";

const repo = "FujoWebDev/fujocoded-plugins";
const workflow = "release-package.yaml";
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

const dispatch = runCommand(dispatchRelease, {
  repo,
  workflow,
});

const syncBack = runCommand(syncBackRelease);

const bootstrap = runCommand(bootstrapRelease, {
  repo,
  workflow,
});

// The release command checks whether the package needs a first-publish
// bootstrap (publish 0.0.0, deprecate it, configure npm Trusted Publishing),
// runs that if needed, then asks whether to release the package immediately
// through the single-package workflow or leave it for the normal main-merge
// flow.
const release = async (packageNameOrDir, options) => {
  try {
    const { skipped, pkg } = await bootstrapRelease({
      ...commandContext,
      repo,
      workflow,
      options,
      packageNameOrDir,
    });

    const prompt = skipped
      ? `${pkg.name} is already on npm. Release just this package now through the single-package workflow?`
      : `Bootstrap complete for ${pkg.name}. Version it and dispatch the single-package release now?`;

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
    "Bootstrap, version, and release one workspace package at a time.",
  );

program
  .command("release")
  .description(
    "Bootstrap a new package if needed, then release it through the single-package workflow.",
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
  .option("--dry-run", "show planned operations without applying changes")
  .action(release);

program
  .command("bootstrap")
  .description(
    "Publish 0.0.0, deprecate it, and configure npm Trusted Publishing for one package.",
  )
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--dry-run", "show planned operations without applying changes")
  .action(bootstrap);

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
  .description(
    "Push and dispatch the release-package workflow for one package.",
  )
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
