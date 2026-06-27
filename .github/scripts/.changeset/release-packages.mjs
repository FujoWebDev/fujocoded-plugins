import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getPackagesSync } from "@manypkg/get-packages";
import parseChangeset from "@changesets/parse";

const releaseVersion = "0.0.1";

const hasChangelogEntry = (changelog, version) =>
  changelog.split("\n").some((line) => {
    const trimmed = line.trim();
    let headingLevel = 0;

    while (trimmed[headingLevel] === "#") {
      headingLevel += 1;
    }

    if (headingLevel < 1 || headingLevel > 6) {
      return false;
    }

    const separator = trimmed[headingLevel];
    if (separator !== " " && separator !== "\t") {
      return false;
    }

    const headingText = trimmed.slice(headingLevel).trim();
    return headingText === version;
  });

const getPublicWorkspacePackages = (repoRoot) =>
  getPackagesSync(repoRoot)
    .packages.filter(
      ({ packageJson }) => !packageJson.private && packageJson.name,
    )
    .map(({ dir, relativeDir, packageJson }) => ({
      dir: relativeDir ?? relative(repoRoot, dir),
      absoluteDir: dir,
      name: packageJson.name,
      version: packageJson.version,
      scripts: packageJson.scripts ?? {},
    }));

export const getPendingChangesets = (repoRoot) =>
  execFileSync("git", ["ls-files", ".changeset"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((file) => file.endsWith(".md") && file !== ".changeset/README.md");

const parseChangesetPackages = (repoRoot, file) => {
  const content = readFileSync(join(repoRoot, file), "utf8");
  return parseChangeset(content).releases.map((release) => release.name);
};

const readPackageJson = (dir) =>
  JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

const getReleasePrepareCandidates = (repoRoot) => {
  const packages = getPublicWorkspacePackages(repoRoot);
  const changesetFiles = getPendingChangesets(repoRoot);
  const changesetsByPackage = new Map();

  for (const file of changesetFiles) {
    for (const packageName of parseChangesetPackages(repoRoot, file)) {
      const files = changesetsByPackage.get(packageName) ?? [];
      files.push(file);
      changesetsByPackage.set(packageName, files);
    }
  }

  return packages
    .filter((pkg) => pkg.version === "0.0.0")
    .filter((pkg) => changesetsByPackage.has(pkg.name))
    .map((pkg) => ({
      ...pkg,
      changesetFiles: changesetsByPackage.get(pkg.name),
    }));
};

const getReleaseDispatchCandidates = (repoRoot) =>
  getPublicWorkspacePackages(repoRoot).filter((pkg) => {
    if (pkg.version !== releaseVersion) {
      return false;
    }

    const changelogPath = join(pkg.absoluteDir, "CHANGELOG.md");
    if (!existsSync(changelogPath)) {
      return false;
    }

    const changelog = readFileSync(changelogPath, "utf8");
    return hasChangelogEntry(changelog, releaseVersion);
  });

export const assertVersionedReleasePackage = (pkg, { repoRoot } = {}) => {
  const manifest = readPackageJson(pkg.absoluteDir);
  if (manifest.name !== pkg.name || manifest.version !== releaseVersion) {
    throw new Error(
      `${pkg.name} must be versioned to ${releaseVersion} before publishing.`,
    );
  }

  for (const changesetFile of pkg.changesetFiles ?? []) {
    const changesetPath = repoRoot
      ? join(repoRoot, changesetFile)
      : changesetFile;
    if (existsSync(changesetPath)) {
      throw new Error(
        `${changesetFile} should be consumed by changeset version.`,
      );
    }
  }

  const changelogPath = join(pkg.absoluteDir, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    throw new Error(`${pkg.dir}/CHANGELOG.md must exist before publishing.`);
  }

  const changelog = readFileSync(changelogPath, "utf8");
  if (!hasChangelogEntry(changelog, releaseVersion)) {
    throw new Error(
      `${pkg.dir}/CHANGELOG.md must contain a ${releaseVersion} entry.`,
    );
  }
};

const getReleaseCandidates = (phase, repoRoot) => {
  if (phase === "prepare") {
    return getReleasePrepareCandidates(repoRoot);
  }

  if (phase === "dispatch") {
    return getReleaseDispatchCandidates(repoRoot);
  }

  throw new Error(`Unknown release phase: ${phase}`);
};

const selectReleaseCandidate = async ({ candidates, choosePackage, phase }) => {
  if (candidates.length === 0) {
    throw new Error(`No first-release ${phase} candidates found.`);
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (!choosePackage) {
    throw new Error(`Multiple first-release ${phase} candidates found.`);
  }

  return await choosePackage({
    candidates,
    message: `Multiple first-release ${phase} candidates found:`,
  });
};

export const resolveReleasePackage = async ({
  choosePackage,
  phase,
  repoRoot,
  requestedPackage,
}) => {
  const candidates = getReleaseCandidates(phase, repoRoot);

  if (!requestedPackage) {
    return await selectReleaseCandidate({
      candidates,
      choosePackage,
      phase,
    });
  }

  const requestedPublicPackage = getPublicWorkspacePackages(repoRoot).find(
    (pkg) => pkg.name === requestedPackage || pkg.dir === requestedPackage,
  );
  if (!requestedPublicPackage) {
    throw new Error(`${requestedPackage} is not a public workspace package.`);
  }

  const requestedCandidate = candidates.find(
    (pkg) => pkg.name === requestedPublicPackage.name,
  );
  if (requestedCandidate) {
    return requestedCandidate;
  }

  const requirement =
    phase === "prepare"
      ? "It must be public, version 0.0.0, and referenced by a pending changeset."
      : `It must be public, version ${releaseVersion}, and have a ${releaseVersion} changelog entry.`;
  throw new Error(
    `${requestedPublicPackage.name} is not a first-release ${phase} candidate. ${requirement}`,
  );
};
