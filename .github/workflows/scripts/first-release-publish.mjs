import { spawnSync } from "node:child_process";
import { resolveFirstReleasePackage } from "../../scripts/.changeset/first-release-packages.mjs";

const npmToken = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;
const requestedPackage = process.env.FIRST_RELEASE_PACKAGE?.trim();
const rawDryRun =
  process.env.FIRST_RELEASE_DRY_RUN ?? process.env.DRY_RUN ?? "";
const dryRun = ["1", "true", "yes", "on"].includes(
  rawDryRun.toLowerCase().trim(),
);

if (!dryRun && !npmToken) {
  console.error(
    "NODE_AUTH_TOKEN or NPM_TOKEN is required for first package releases.",
  );
  process.exit(1);
}

if (!requestedPackage) {
  console.error(
    "FIRST_RELEASE_PACKAGE is required. Pass the package_name workflow input.",
  );
  process.exit(1);
}

let selectedCandidate;
try {
  selectedCandidate = await resolveFirstReleasePackage({
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
  console.error(`${requestedPackage} is already published on npm.`);
  if (!dryRun) {
    process.exit(1);
  }
  console.log("[dry-run] Continuing for validation without publishing.");
}

const publishedVersionError = `${publishedVersion.stderr}\n${publishedVersion.stdout}`;
if (/E404|404 Not Found/.test(publishedVersionError)) {
  console.log(`${selectedCandidate.name} is not published yet.`);
} else if (publishedVersion.status !== 0 && !dryRun) {
  process.stderr.write(publishedVersionError);
  process.exit(publishedVersion.status ?? 1);
}

if (dryRun) {
  console.log(
    `[dry-run] Would run: npm publish --provenance --access public in ${selectedCandidate.absoluteDir}.`,
  );
  console.log(
    `[dry-run] Would tag git with ${selectedCandidate.name}@${selectedCandidate.version}.`,
  );
  process.exit(0);
}

const whoami = spawnSync(
  "npm",
  ["whoami", "--registry", "https://registry.npmjs.org"],
  {
    cwd: selectedCandidate.absoluteDir,
    encoding: "utf8",
    env: { ...process.env, NODE_AUTH_TOKEN: npmToken, NPM_TOKEN: npmToken },
    stdio: ["inherit", "pipe", "pipe"],
  },
);

process.stdout.write(whoami.stdout);
process.stderr.write(whoami.stderr);

if (whoami.status !== 0) {
  console.error(
    `${selectedCandidate.name} could not authenticate to npm before publish.`,
  );
  process.exit(whoami.status ?? 1);
}

const result = spawnSync(
  "npm",
  ["publish", "--provenance", "--access", "public"],
  {
    cwd: selectedCandidate.absoluteDir,
    encoding: "utf8",
    env: { ...process.env, NODE_AUTH_TOKEN: npmToken, NPM_TOKEN: npmToken },
    stdio: ["inherit", "pipe", "pipe"],
  },
);

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

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
