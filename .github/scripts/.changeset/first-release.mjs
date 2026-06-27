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
  dispatchFirstRelease,
  findRepoRoot,
  prepareFirstRelease,
  syncBackFirstRelease,
} from "./first-release-runner.mjs";

const repo = "FujoWebDev/fujocoded-plugins";
const workflow = "first-release.yaml";
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

const prepare = runCommand(prepareFirstRelease);

const dispatch = runCommand(dispatchFirstRelease, {
  repo,
  workflow,
});

const syncBack = runCommand(syncBackFirstRelease);

const program = new Command();

program
  .name("first-release")
  .description(
    "Prepare and dispatch the first npm release for one workspace package.",
  );

program
  .command("prepare")
  .description("Create a versioned first-release branch for one package.")
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--branch <branch>", "branch name to create")
  .option("--commit", "prompt for a local commit after preparing")
  .option("--dry-run", "show planned operations without applying changes")
  .action(prepare);

program
  .command("dispatch")
  .description("Push and dispatch the first-release workflow for one package.")
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .option("--branch <branch>", "branch name to require")
  .option("--otp <otp>", "One-time password for npm token create")
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
    "Apply only the published first-release package state back to another branch.",
  )
  .argument("[package-name-or-dir]", "workspace package name or directory")
  .requiredOption("--target <branch>", "branch to update")
  .option("--branch <branch>", "first-release branch name to require")
  .option("--commit", "prompt for a local commit after syncing")
  .option("--dry-run", "show planned operations without applying changes")
  .action(syncBack);

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  await program.parseAsync();
}
