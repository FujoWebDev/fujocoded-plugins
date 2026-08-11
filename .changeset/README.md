# Changesets

This is the internal release runbook for the FujoCoded plugins monorepo. All
publishes from this repo go through `.github/workflows/release.yaml` using
GitHub Actions OIDC (NPM Trusted Publishing) with provenance.

Start with the quick-reference table, then read the full workflow section if you
need to understand the release modes or debug an unexpected failure.

## Quick reference

| I want to...                                           | Section                                                             | Command                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ship a changeset through the normal main-merge flow    | [Regular flow](#regular-flow-release-everything-at-once)            | `npx changeset`; merge PR; merge the Release PR                                                      |
| Ship one package immediately                           | [Single-package flow](#single-package-flow-release-one-package-now) | `cd .changeset && npm run release -- @fujocoded/<pkg>`                                               |
| Publish a beta/prerelease of all packages              | [Prerelease flow](#prerelease-flow-ship-betas-of-everything)        | `npx changeset pre enter <tag>` + `npx changeset version`, then dispatch workflow `mode: prerelease` |
| Set up a brand-new package for NPM Trusted Publishing  | [New-package setup](#new-package-setup)                             | `cd .changeset && npm run release:trust -- @fujocoded/<pkg>`                                         |
| See which packages lack Trusted Publishing (read-only) | [Every package at once](#every-package-at-once)                     | `cd .changeset && npm run release:trust -- --all --dry-run`                                          |
| Configure Trusted Publishing everywhere it is missing  | [Every package at once](#every-package-at-once)                     | `cd .changeset && npm run release:trust -- --all`                                                    |

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
- If it is not, sets it up: publishes `0.0.0` locally, deprecates it, and
  runs `npm trust github` to configure Trusted Publishing
- If it is on npm but Trusted Publishing isn't configured, either because a previous
  attempt failed at the trust step, or the package predates Trusted Publishing
  and was published with a classic token: runs just the trust step without
  re-publishing. Never deprecates a real release.
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

### New-package setup

NPM Trusted Publishing cannot be configured until a package already exists on
the registry. For a brand-new package we therefore publish a `0.0.0` placeholder
locally, deprecate it, and configure trust. After that, the package can publish
through GitHub Actions OIDC like every other package.

The top-level `release` command detects an unpublished package and runs the
trust setup automatically. To run it by itself:

```bash
cd .changeset
npm run release:trust -- @fujocoded/astro-smooth-actions
```

> [!WARNING]
> Before running it, confirm that:
>
> - You are logged in to npm (check with `npm whoami`)
> - If the package has never been published, it is at version `0.0.0` in its
>   `package.json`

`release:trust` asks npm whether Trusted Publishing is already configured, and does
whichever of these applies:

| On npm                   | What runs                                          |
| ------------------------ | -------------------------------------------------- |
| Not published            | build → publish `0.0.0` → deprecate it → trust     |
| Published at `0.0.0`     | deprecate `0.0.0` if it isn't already → trust      |
| Published above `0.0.0`  | trust only — nothing published, nothing deprecated |
| Published, trust present | nothing                                            |

The trust step is:

```bash
npm trust github <package> --repo FujoWebDev/fujocoded-plugins --file release.yaml --allow-publish
```

Only the `0.0.0` placeholder is ever deprecated; a real release never is. Row 2
is a partly-finished setup — a previous run published `0.0.0` and then died
before configuring trust. Row 3 is a package that predates Trusted Publishing in
this repo and was published with a classic token; it needs trust attached but
must not be touched otherwise.

The first row is the only one that publishes, and it is the only one that
requires the manifest to be at `0.0.0` — otherwise the command refuses rather
than publishing a placeholder over a real version number.

None of this requires a pending changeset: configuring trust is independent of
releasing.

The `0.0.0` placeholder remains on npm but is deprecated and hidden from default
installs. It exists only so Trusted Publishing can be configured.

#### Every package at once

To see which packages are missing Trusted Publishing, without changing anything:

```bash
cd .changeset
npm run release:trust -- --all --dry-run
```

This is read-only. It prints the trust commands it would run and a per-package
summary, and touches neither npm nor the repo.

To actually configure the ones that are missing it:

```bash
cd .changeset
npm run release:trust -- --all
```

This **writes to npm**: every package without Trusted Publishing gets it
configured. Packages that already have it are left untouched, and nothing is
published or deprecated for a package that is already on npm at a real version.

Each package is independent: if one fails — an expired npm session is the usual
cause, since the OTP challenge can reappear part way through — it is recorded
and the run continues, then the command exits non-zero with a per-package
summary. Re-running is safe and only retries what is still missing.

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
> Publishing configured. It will prepare a release for a package without trust
> configured, but the dispatch step will then fail. Use `release:trust` (or the
> top-level `release` command, which runs it first) for such packages.

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

| Command             | What it does                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `release`           | Configure trust if needed, then version + dispatch + sync-back                             |
| `release:trust`     | Configure Trusted Publishing, publishing a `0.0.0` placeholder first if the package is new |
| `release:prepare`   | Version one package on a temporary branch                                                  |
| `release:dispatch`  | Push branch, trigger `release.yaml`, watch, sync back                                      |
| `release:sync-back` | Carry versioned state from a release branch to a target branch                             |

## Common flags

All single-package commands support `--dry-run`, which prints the intended
operations without changing files, branches, or the registry.

If you don't pass a package name, you get an interactive prompt to pick one.

### `release`

`release` combines trust setup, prepare, and dispatch, so it accepts flags that
affect the prepare and dispatch phases.

- `--branch <name>` — use this branch name in `release:prepare`, skipping the
  auto-rename to `release/<pkg>-<version>`
- `--target <branch>` — sync the published state back to this branch
- `--commit` — prompt for a local commit after preparing the versioned branch
- `--allow-dirty` — allow dispatch when the working tree is not clean
- `--dry-run` — show planned operations

### `release:trust`

- `--all` — check every public package and configure the ones missing Trusted
  Publishing; takes no package name
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
