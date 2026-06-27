import { spawnSync } from "node:child_process";
import { resolveReleasePackage } from "../../scripts/.changeset/release-packages.mjs";
// Publishes a single pre-selected workspace package via npm Trusted Publishing.
//
// Authentication comes from the GitHub Actions OIDC token via the
// NODE_AUTH_TOKEN env var that actions/setup-node sets up for trusted
// publishing. No classic npm token or NPM_TOKEN secret is needed. The package
// must already exist on npm and have Trusted Publishing configured.
//
// Environment:
//   RELEASE_PACKAGE  - package name to publish (from workflow_dispatch input)
//   NODE_AUTH_TOKEN  - OIDC token from actions/setup-node (trusted publishing)
//   DRY_RUN          - if "1"/"true", runs npm publish --dry-run
//
// Exits non-zero if the package is already published at the current version,
// since re-publishing an existing version is always an error.

const requestedPackage = process.env.RELEASE_PACKAGE?.trim();
const rawDryRun =
  process.env.RELEASE_PACKAGE_DRY_RUN ?? process.env.DRY_RUN ?? "";
const dryRun = ["1", "true", "yes", "on"].includes(
  rawDryRun.toLowerCase().trim(),
);

if (!requestedPackage) {
  console.error("RELEASE_PACKAGE environment variable is required.");
  process.exit(1);
}

let selectedCandidate;
try {
  selectedCandidate = await resolveReleasePackage({
    phase: "dispatch",
    repoRoot: process.cwd(),
    requestedPackage,
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const publishedVersion = spawnSync(
  "npm",
  ["view", selectedCandidate.name, "version"],
  {
    encoding: "utf8",
  },
);

if (publishedVersion.status === 0) {
  const latest = publishedVersion.stdout.trim();
  if (latest === selectedCandidate.version) {
    console.error(
      `${selectedCandidate.name}@${selectedCandidate.version} is already published.`,
    );
    process.exit(1);
  }

  console.log(
    `${selectedCandidate.name} is at ${latest} on npm; publishing ${selectedCandidate.version}.`,
  );
} else {
  const publishedVersionError = `${publishedVersion.stderr}\n${publishedVersion.stdout}`;
  if (/E404|404 Not Found/.test(publishedVersionError)) {
    console.error(
      `${selectedCandidate.name} is not published yet. Run the bootstrap command first to publish 0.0.0 and configure Trusted Publishing.`,
    );
    process.exit(1);
  } else if (!dryRun) {
    console.error(
      `Could not check npm for ${selectedCandidate.name}:\n${publishedVersionError}`,
    );
    process.exit(1);
  }

  console.log(
    `${selectedCandidate.name} is not published yet (dry run: continuing anyway).`,
  );
}

if (dryRun) {
  const result = spawnSync(
    "npm",
    ["publish", "--dry-run", "--access", "public"],
    {
      cwd: selectedCandidate.absoluteDir,
      encoding: "utf8",
      stdio: "inherit",
    },
  );
  process.exit(result.status ?? 1);
}

const result = spawnSync(
  "npm",
  ["publish", "--provenance", "--access", "public"],
  {
    cwd: selectedCandidate.absoluteDir,
    encoding: "utf8",
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const tagName = `${selectedCandidate.name}@${selectedCandidate.version}`;
const tag = spawnSync("git", ["tag", tagName], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});

process.stdout.write(tag.stdout);
process.stderr.write(tag.stderr);

if (tag.status !== 0) {
  console.error(
    `${selectedCandidate.name} was published, but git tag ${tagName} could not be created.`,
  );
  process.exit(tag.status ?? 1);
}

console.log(`New tag: ${tagName}`);
