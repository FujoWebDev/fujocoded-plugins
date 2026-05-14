/**
 * Verifies the package works against every example in `__examples__/` by
 * installing a freshly packed tarball, without trusting the workspace source (bad mistake!!).
 *
 * For each example we:
 * 1. Copy the example into a temp workspace (skipping `node_modules`, build output, and the local `.npmrc`)
 * 2. Rewrite its `package.json` to depend on the packed tarball
 * 3. Run `npm install --ignore-scripts`, then the example's verification commands
 *
 * Going through `npm pack` catches packaging bugs (missing `files`, wrong `exports`,
 * stale `dist/`) that a workspace-linked install would hide.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const examplesRoot = join(packageRoot, "__examples__");
const workspace = mkdtempSync(join(tmpdir(), "zod-transform-socials-compat-"));

const PACKAGE_NAME = "@fujocoded/zod-transform-socials";

const SKIP_ON_COPY = new Set([
  "node_modules",
  "dist",
  ".astro",
  "package-lock.json",
  ".npmrc",
]);

const run = (
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): string => {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${detail}`.trim(),
    );
  }

  return String(result.stdout).trim();
};

const copyExample = (sourceDir: string, destDir: string): void => {
  cpSync(sourceDir, destDir, {
    recursive: true,
    filter: (src) => !SKIP_ON_COPY.has(basename(src)),
  });
};

const rewriteDependencyToTarball = (
  projectDir: string,
  tarball: string,
): void => {
  const pkgPath = join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.dependencies?.[PACKAGE_NAME]) {
    throw new Error(`${pkgPath} does not depend on ${PACKAGE_NAME}`);
  }
  pkg.dependencies[PACKAGE_NAME] = `file:${tarball}`;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

type TestCase = {
  dir: string;
  commands: Array<[string, string[]]>;
};

const cases: TestCase[] = [
  { dir: "01-astro-5-loader", commands: [["npm", ["run", "build"]]] },
  { dir: "02-astro-6-loader", commands: [["npm", ["run", "build"]]] },
  {
    dir: "03-zod-3-standalone",
    commands: [
      ["npm", ["run", "typecheck"]],
      ["npm", ["start"]],
    ],
  },
  {
    dir: "04-zod-4-standalone",
    commands: [
      ["npm", ["run", "typecheck"]],
      ["npm", ["start"]],
    ],
  },
];

try {
  const packOutput = run("npm", ["pack", "--pack-destination", workspace]);
  const tarballName = packOutput.split("\n").at(-1);
  if (!tarballName) {
    throw new Error("`npm pack` produced no output");
  }
  const tarball = join(workspace, tarballName);

  const availableExamples = new Set(readdirSync(examplesRoot));
  for (const { dir } of cases) {
    if (!availableExamples.has(dir)) {
      throw new Error(`Expected example __examples__/${dir} to exist`);
    }
  }

  for (const testCase of cases) {
    const root = join(workspace, testCase.dir);
    copyExample(join(examplesRoot, testCase.dir), root);
    rewriteDependencyToTarball(root, tarball);

    run("npm", ["install", "--ignore-scripts"], { cwd: root });

    for (const [command, args] of testCase.commands) {
      run(command, args, { cwd: root });
    }

    console.log(`ok ${testCase.dir}`);
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
