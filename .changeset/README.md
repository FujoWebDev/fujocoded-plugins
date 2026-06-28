# Changesets

This is the internal release runbook for the FujoCoded plugins monorepo. All
publishes from this repo go through `.github/workflows/release.yaml` using
GitHub Actions OIDC (NPM Trusted Publishing) with provenance.

Start with the quick-reference table, then read the full workflow section if you
need to understand the release modes or debug an unexpected failure.

## Quick reference

| I want to...                                          | Section                                                             | Command                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ship a changeset through the normal main-merge flow   | [Regular flow](#regular-flow-release-everything-at-once)            | `npx changeset`; merge PR; merge the Release PR                                                      |
| Ship one package immediately                          | [Single-package flow](#single-package-flow-release-one-package-now) | `cd .changeset && npm run release -- @fujocoded/<pkg>`                                               |
| Publish a beta/prerelease of all packages             | [Prerelease flow](#prerelease-flow-ship-betas-of-everything)        | `npx changeset pre enter <tag>` + `npx changeset version`, then dispatch workflow `mode: prerelease` |
| Set up a brand-new package for NPM Trusted Publishing | [New-package bootstrap](#new-package-bootstrap)                     | `cd .changeset && npm run release:bootstrap -- @fujocoded/<pkg>`                                     |

## Regular flow

This is the default path. Every push to `main` adds pending changesets to a
single Release PR. Merging that PR publishes every versioned package to npm at
once.

1. Add a changeset describing what changed:

   ```bash
   npx changeset
   ```

2. Commit the changeset and merge your feature PR to `main`.

3. `.github/workflows/release.yaml` runs on push and updates the Release PR with
   any newly versioned packages. The Release PR stays open and accumulates
   further changesets.

4. When you are ready to ship, merge the Release PR. The workflow publishes
   every versioned package to npm with `--provenance`.

If a publish fails after the Release PR is merged, re-dispatch the `Release`
workflow with `mode: latest-retry`. This mode requires the branch to be out of
pre mode (`.changeset/pre.json` must not exist).

## Prerelease flow

Use this to publish prerelease versions such as `0.1.0-beta.0` under a dist-tag
other than `latest`. Consumers opt in with `npm install <pkg>@beta`, and the
`latest` tag stays untouched. Like the regular flow, this publishes **every**
package that has a pending changeset.

> [!NOTE]
> There is no dedicated `.changeset` helper script for prereleases. This flow
> uses `npx changeset` directly on a branch, then dispatches the `Release`
> workflow with `mode: prerelease`.

1. On a branch, enter changesets pre mode with the tag you want:

   ```bash
   npx changeset pre enter beta
   ```

   This writes `.changeset/pre.json`. Commit it.

2. Version the packages:

   ```bash
   npx changeset version
   ```

   In pre mode this converts pending changesets into prerelease versions (for
   example `0.1.0-beta.0`). Commit the result and push the branch.

3. Dispatch the `Release` workflow against that branch:

   ```bash
   gh workflow run release.yaml --ref <branch>
   ```

   Choose `mode: prerelease`.

4. The workflow checks that `.changeset/pre.json` exists and runs
   `changeset publish --provenance`. Every versioned package is published under
   the prerelease dist-tag from `pre.json`.

When you are ready to ship stable, exit pre mode and use the regular flow:

```bash
npx changeset pre exit
```

> [!IMPORTANT]
> Scope and channel come from the branch, not from the dispatch input. The
> `mode` option only selects which validation rules to run. See
> [How releasing works](#how-releasing-works) for the full table.

## Single-package flow

Use this when you want to release one package without waiting for the Release
PR. These commands live in `.changeset/package.json`, so all snippets in this
section assume you are inside the `.changeset` directory:

```bash
cd .changeset
npm run release -- @fujocoded/astro-smooth-actions
```

This command:

- Checks whether the package is already on the npm registry
- If it is not, bootstraps it: publishes `0.0.0` locally, deprecates it, and
  runs `npm trust github` to configure Trusted Publishing
- Asks whether to release the package immediately or leave it for the regular
  main-merge flow

If you choose to release, it then:

- Versions the package on a temporary branch
- Deletes the other pending changesets so only your package is updated (their
  originals stay on the branch you started from)
- Pushes the branch
- Dispatches `release.yaml` with `mode: single-package`
- Once the run is done, it then syncs the versioned state back to the target
  branch

Try and witness it (without edits):

```bash
npm run release -- @fujocoded/astro-smooth-actions --dry-run
```

> [!IMPORTANT]
> The single-package flow isn't available in pre mode when other packages have
> pending changesets: it doesn't play well with `pre.json`, which tracks the
> accumulated prerelease state across the whole branch. Release everything
> together (the [prerelease flow](#prerelease-flow)) or exit pre mode first.

### New-package bootstrap

NPM Trusted Publishing cannot be configured until a package already exists on
the registry. For a brand-new package we therefore publish a `0.0.0` placeholder
locally, deprecate it, and configure trust. After that, the package can publish
through GitHub Actions OIDC like every other package.

The top-level `release` command detects an unpublished package and runs the
bootstrap automatically. To run the bootstrap step by itself:

```bash
cd .changeset
npm run release:bootstrap -- @fujocoded/astro-smooth-actions
```

> [!WARNING]
> Before bootstrapping, confirm that:
>
> - You are logged in to npm (check with `npm whoami`)
> - The package is at version `0.0.0` in its `package.json` and has a pending
>   changeset

This step:

- Builds the package and runs `npm publish --access public` at `0.0.0`
- Deprecates `0.0.0` with a message pointing to `0.0.1` or later
- Runs `npm trust github <package> --repo FujoWebDev/fujocoded-plugins --file release.yaml --allow-publish`

The `0.0.0` placeholder remains on npm but is deprecated and hidden from default
installs. It exists only so Trusted Publishing can be configured.

### Other single-package commands

All the steps that make up `release` are available separately.

#### Version the package on a branch

```bash
cd .changeset
npm run release:prepare -- @fujocoded/astro-smooth-actions --commit
```

This creates a temporary branch `release/<pkg>`, removes unrelated pending
changesets on that branch, runs `changeset version`, re-reads the manifest to
learn the new version, and renames the branch to `release/<pkg>-<version>`
(for example `release/astro-smooth-actions-0.1.0`). Pass `--branch <name>` to
use an explicit branch name and skip the rename. It then refreshes lockfiles
under the package and runs focused checks.

> [!WARNING]
> `release:prepare` assumes the package already exists on npm with Trusted
> Publishing configured. It will prepare a release for an unbootstrapped
> package, but the dispatch step will then fail. Use `release:bootstrap` (or the
> top-level `release` command, which bootstraps first) for new packages.

#### Dispatch the single-package workflow

```bash
cd .changeset
npm run release:dispatch -- @fujocoded/astro-smooth-actions --target main
```

This pushes the versioned branch, dispatches `release.yaml` with
`mode: single-package`, watches the run, and syncs the versioned state back to
the target branch.

#### Sync back later

If you skipped `--target` during dispatch, sync the release state back to your
branch afterwards:

```bash
cd .changeset
npm run release:sync-back -- @fujocoded/astro-smooth-actions --target main --branch release/astro-smooth-actions-0.1.0 --commit
```

## How releasing works

All publishes go through `.github/workflows/release.yaml`. The workflow has two
triggers:

- **push to `main`** — the normal flow. `changesets/action` keeps a Release PR
  open that accumulates pending changesets; merging it publishes every versioned
  package at once.
- **manual dispatch** — publishes whatever is already versioned on the branch.
  The `mode` input selects only the validation rules.

Scope and channel come from the branch, not from inputs:

- **Scope** (one package vs all) comes from what is versioned on the branch.
- **Channel** (stable `latest` vs a prerelease dist-tag) comes from
  `.changeset/pre.json`.

The dispatch `mode` selects only the validation rules:

| Behavior                     | `prerelease` | `latest-retry` | `single-package` |
| ---------------------------- | ------------ | -------------- | ---------------- |
| `.changeset/pre.json`        | required     | forbidden      | neither          |
| pending-changesets guard     | yes (shared) | yes (shared)   | yes (shared)     |
| GitHub Releases (via action) | yes          | yes            | yes              |

"Prerelease single" is not a separate mode. It is `single-package` dispatched on
a branch that has `pre.json` plus exactly one versioned package.

## Command summary

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `release`           | Bootstrap if needed, then version + dispatch + sync-back       |
| `release:bootstrap` | Publish `0.0.0`, deprecate it, configure Trusted Publishing    |
| `release:prepare`   | Version one package on a temporary branch                      |
| `release:dispatch`  | Push branch, trigger `release.yaml`, watch, sync back          |
| `release:sync-back` | Carry versioned state from a release branch to a target branch |

## Common flags

All single-package commands support `--dry-run`, which prints the intended
operations without changing files, branches, or the registry.

If you don't pass a package name, you get an interactive prompt to pick one.

### `release`

`release` combines bootstrap, prepare, and dispatch, so it accepts flags that
affect the prepare and dispatch phases.

- `--branch <name>` — use this branch name in `release:prepare`, skipping the
  auto-rename to `release/<pkg>-<version>`
- `--target <branch>` — sync the published state back to this branch
- `--commit` — prompt for a local commit after preparing the versioned branch
- `--allow-dirty` — allow dispatch when the working tree is not clean
- `--dry-run` — show planned operations

### `release:bootstrap`

- `--dry-run` — show planned operations

### `release:prepare`

- `--branch <name>` — create this branch name and skip the temp-branch rename
- `--commit` — prompt for a local commit after preparing the versioned branch
- `--dry-run` — show planned operations

### `release:dispatch`

- `--branch <name>` — require this exact release branch instead of discovering
  it from the package name and version
- `--target <branch>` — sync the published state back to this branch after the
  workflow completes
- `--commit` — prompt for a local sync-back commit after publishing
- `--allow-dirty` — allow dispatch when the working tree is not clean
- `--dry-run` — show planned operations

### `release:sync-back`

- `--target <branch>` (required) — branch to apply the release state to
- `--branch <name>` — require this exact release branch
- `--commit` — prompt for a local commit after syncing
- `--dry-run` — show planned operations

For the upstream changesets documentation, see
[changesets/changesets](https://github.com/changesets/changesets).
