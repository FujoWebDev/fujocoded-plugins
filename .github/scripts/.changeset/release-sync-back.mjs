import { spawnSync } from "node:child_process";
import { join } from "node:path";
import parseChangeset from "@changesets/parse";
import { resolveReleasePackage } from "./release-packages.mjs";

const gitPathExists = ({ repoRoot, ref, path }) => {
  const exists = spawnSync("git", ["cat-file", "-e", `${ref}:${path}`], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  return exists.status === 0;
};

const gitFile = ({ capture, path, ref, repoRoot }) =>
  capture("git", ["show", `${ref}:${path}`], { cwd: repoRoot });

const gitTrackedFiles = ({ capture, path, ref, repoRoot }) =>
  capture("git", ["ls-tree", "-r", "--name-only", ref, path], {
    cwd: repoRoot,
  })
    .split("\n")
    .filter(Boolean);

const findTargetChangesetsForPackage = ({
  capture,
  packageName,
  repoRoot,
  target,
}) =>
  gitTrackedFiles({ capture, path: ".changeset", ref: target, repoRoot })
    .filter((file) => file.endsWith(".md") && file !== ".changeset/README.md")
    .filter((file) =>
      parseChangeset(
        gitFile({ capture, path: file, ref: target, repoRoot }),
      ).releases.some((release) => release.name === packageName),
    );

const releaseCarryForwardFiles = ({
  findLockfilePackageDirs,
  pkg,
  repoRoot,
  sourceBranch,
}) =>
  [
    "package-lock.json",
    `${pkg.dir}/package.json`,
    `${pkg.dir}/CHANGELOG.md`,
    ...findLockfilePackageDirs(pkg.absoluteDir).map((dir) =>
      join(dir, "package-lock.json").slice(repoRoot.length + 1),
    ),
  ]
    .filter((file, index, files) => files.indexOf(file) === index)
    .filter((file) =>
      gitPathExists({ path: file, ref: sourceBranch, repoRoot }),
    );

const getSyncBackPlan = ({
  capture,
  findLockfilePackageDirs,
  pkg,
  repoRoot,
  sourceBranch,
  target,
}) => {
  const releaseFiles = releaseCarryForwardFiles({
    findLockfilePackageDirs,
    pkg,
    repoRoot,
    sourceBranch,
  });
  const changesetFiles = findTargetChangesetsForPackage({
    capture,
    packageName: pkg.name,
    repoRoot,
    target,
  });

  if (changesetFiles.length === 0) {
    throw new Error(`No pending changeset for ${pkg.name} found on ${target}.`);
  }

  return { changesetFiles, releaseFiles };
};

const applyReleaseSyncBack = ({
  dryRun,
  logStep,
  releaseFiles,
  repoRoot,
  run,
  sourceBranch,
  target,
  changesetFiles,
}) => {
  logStep(`Switching to ${target}.`);
  run("git", ["switch", target], {
    cwd: repoRoot,
    dryRun,
  });

  logStep("Restoring versioned package files.");
  run("git", ["restore", "--source", sourceBranch, "--", ...releaseFiles], {
    cwd: repoRoot,
    dryRun,
  });

  logStep("Removing consumed package changeset.");
  run("git", ["rm", "--ignore-unmatch", "--", ...changesetFiles], {
    cwd: repoRoot,
    dryRun,
  });

  return { changesetFiles, releaseFiles };
};

const maybeCommitSyncBack = async ({
  confirmYes,
  dryRunCommitMessage,
  options,
  pkg,
  releaseFiles,
  repoRoot,
  run,
}) => {
  if (!options.commit) {
    return;
  }

  if (options.dryRun && dryRunCommitMessage) {
    console.log(dryRunCommitMessage);
    return;
  }

  if (
    !(await confirmYes(
      `Commit ${pkg.name} release sync-back on ${options.target}? This runs git add and git commit locally.`,
    ))
  ) {
    return;
  }

  // The consumed changeset is already staged for deletion by `git rm` in
  // applyReleaseSyncBack, so it must not be re-added here — `git add` on a path
  // that no longer exists fails with a pathspec error and aborts the whole add.
  run("git", ["add", "--", ...releaseFiles], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });
  run("git", ["commit", "-m", `Record ${pkg.name} release`], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });
};

const syncBackLaterCommand = ({ branchName, pkg, target }) =>
  `npm --prefix .changeset run release:sync-back -- ${pkg.name} --target=${target} --branch=${branchName} --commit`;

export const maybeSyncBackAfterDispatch = async ({
  confirmYes,
  helpers,
  logStep,
  note,
  options,
  pkg,
  repoRoot,
  sourceBranch,
}) => {
  if (!options.target) {
    note(
      syncBackLaterCommand({
        branchName: sourceBranch,
        pkg,
        target: "<branch>",
      }),
      "Sync the release state back later",
    );
    return;
  }

  if (
    !options.dryRun &&
    !(await confirmYes(
      `Sync ${pkg.name} release state back to ${options.target} now? This switches branches.`,
    ))
  ) {
    note(
      syncBackLaterCommand({
        branchName: sourceBranch,
        pkg,
        target: options.target,
      }),
      "Sync the release state back later",
    );
    return;
  }

  const { capture, findLockfilePackageDirs, run } = helpers;
  const plan = getSyncBackPlan({
    capture,
    findLockfilePackageDirs,
    pkg,
    repoRoot,
    sourceBranch,
    target: options.target,
  });

  const applied = applyReleaseSyncBack({
    dryRun: options.dryRun,
    logStep,
    releaseFiles: plan.releaseFiles,
    repoRoot,
    run,
    sourceBranch,
    target: options.target,
    changesetFiles: plan.changesetFiles,
  });

  run("git", ["status", "--short"], {
    cwd: repoRoot,
    dryRun: options.dryRun,
  });

  await maybeCommitSyncBack({
    confirmYes,
    dryRunCommitMessage: `[dry-run] git add <release files and consumed changeset> && git commit -m "Record ${pkg.name} release"`,
    options,
    pkg,
    releaseFiles: applied.releaseFiles,
    repoRoot,
    run,
  });
};

export const syncBackRelease = async ({
  choosePackage,
  confirmYes,
  helpers,
  logStep,
  note,
  options,
  outro,
  packageNameOrDir,
  repoRoot,
}) => {
  const {
    assertCleanTree,
    capture,
    findLockfilePackageDirs,
    getBranchName,
    run,
  } = helpers;

  assertCleanTree(repoRoot);

  if (!options.target) {
    throw new Error("Pass --target <branch> for the branch to update.");
  }

  const pkg = await resolveReleasePackage({
    choosePackage,
    phase: "dispatch",
    repoRoot,
    requestedPackage: packageNameOrDir,
  });
  const sourceBranch = getBranchName(pkg, options);

  const currentBranch = capture("git", ["branch", "--show-current"], {
    cwd: repoRoot,
  });
  if (currentBranch !== sourceBranch) {
    throw new Error(
      `Current branch is ${currentBranch}; expected ${sourceBranch}.`,
    );
  }

  const plan = getSyncBackPlan({
    capture,
    findLockfilePackageDirs,
    pkg,
    repoRoot,
    sourceBranch,
    target: options.target,
  });

  note(
    [
      ...plan.releaseFiles,
      ...plan.changesetFiles.map((file) => `${file} (delete)`),
    ].join("\n"),
    `Clean sync-back from ${sourceBranch} to ${options.target}`,
  );

  if (
    !(await confirmYes(
      options.dryRun
        ? `Dry run: show commands to sync ${pkg.name} release state back to ${options.target}?`
        : `Switch to ${options.target} and apply only ${pkg.name} release state from ${sourceBranch}?`,
    ))
  ) {
    throw new Error("Canceled.");
  }

  const applied = applyReleaseSyncBack({
    dryRun: options.dryRun,
    logStep,
    releaseFiles: plan.releaseFiles,
    repoRoot,
    run,
    sourceBranch,
    target: options.target,
    changesetFiles: plan.changesetFiles,
  });

  run("git", ["status", "--short"], { cwd: repoRoot, dryRun: options.dryRun });

  await maybeCommitSyncBack({
    confirmYes,
    dryRunCommitMessage: undefined,
    options,
    pkg,
    releaseFiles: applied.releaseFiles,
    repoRoot,
    run,
  });

  outro(`Synced ${pkg.name} release back to ${options.target}.`);
};
