import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.NPM_TOKEN) {
  console.error("NPM_TOKEN is required for first package releases.");
  process.exit(1);
}

const root = JSON.parse(readFileSync("package.json", "utf8"));
const workspaces = Array.isArray(root.workspaces)
  ? root.workspaces
  : (root.workspaces?.packages ?? []);

const packages = [];

for (const workspace of workspaces) {
  if (workspace !== "*/") {
    continue;
  }

  for (const entry of readdirSync(".", { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    try {
      const manifest = JSON.parse(
        readFileSync(join(entry.name, "package.json"), "utf8"),
      );
      if (!manifest.private && manifest.name && manifest.version) {
        packages.push({
          dir: entry.name,
          name: manifest.name,
          version: manifest.version,
        });
      }
    } catch {
      // Not a workspace package.
    }
  }
}

const missingPackages = [];

for (const pkg of packages) {
  const result = spawnSync("npm", ["view", pkg.name, "version"], {
    encoding: "utf8",
  });

  if (result.status === 0) {
    continue;
  }

  const error = `${result.stderr}\n${result.stdout}`;
  if (/E404|404 Not Found/.test(error)) {
    console.log(`${pkg.name} is not published yet.`);
    missingPackages.push(pkg);
    continue;
  }

  process.stderr.write(error);
  process.exit(result.status ?? 1);
}

if (missingPackages.length === 0) {
  console.error("No unpublished public workspace packages found.");
  process.exit(1);
}

for (const pkg of missingPackages) {
  const changelogPath = join(pkg.dir, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    console.error(
      `${pkg.name} is missing CHANGELOG.md. Create the first version changelog before publishing so changesets/action can create the GitHub Release.`,
    );
    process.exit(1);
  }

  const changelog = readFileSync(changelogPath, "utf8");
  const versionHeading = new RegExp(`^#{1,6}\\s+${pkg.version}\\s*$`, "m");
  if (!versionHeading.test(changelog)) {
    console.error(
      `${pkg.name} CHANGELOG.md is missing a ${pkg.version} entry. Create the first version changelog before publishing so changesets/action can create the GitHub Release.`,
    );
    process.exit(1);
  }
}

for (const pkg of missingPackages) {
  const result = spawnSync("npm", ["publish", pkg.dir, "--provenance"], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log(`New tag: ${pkg.name}@${pkg.version}`);
}
