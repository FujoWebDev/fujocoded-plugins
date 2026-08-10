# @fujocoded/astro-atproto-loader

## 0.2.2

### Patch Changes

- [#50](https://github.com/FujoWebDev/fujocoded-plugins/pull/50) [`004a922`](https://github.com/FujoWebDev/fujocoded-plugins/commit/004a92204cd8e9512f7b532f0b204b07d712f1a8) Thanks [@essential-randomness](https://github.com/essential-randomness)!

  Overhaul caching and error handling in the live loader:
  - **Fix:** the live loader cached the whole collection as one snapshot, so when
    a single source failed during a refresh its records silently vanished. Each
    source now keeps its own stale-while-revalidate cache: a failed refresh serves
    that source's last good records (and logs the failure) instead of dropping
    them.
  - Cold-start failures (a source erroring before it has anything cached) are no
    longer swallowed silently: the new `onInitialLoadError` option defaults to
    `"empty"` (preserves existing behavior) but can be set to `"throw"` to surface
    them as loader errors. This will change in a future release, so it should be
    set to "empty" explicitly if the behavior should be preserved longer term.
  - `fetchRecord` hydration now shares a process-wide cache across loader
    instances, with a fixed policy: 5 minute TTL, 5 second retry for transient
    failures, 20,000 record cap.

## 0.2.1

### Patch Changes

- 8bd3453: Fixes `0.2.0`, which was broken: `defineAtProtoCollection` and `defineAtProtoLiveCollection` didn't return the shape Astro expected, so callers had to wrap them in `defineCollection` / `defineLiveCollection` themselves. They now return the real Astro collection shape and work as documented.

  **Breaking:** `fetchRecord({ atUri })` now resolves to `{ value, repo }` instead of just the record value. Existing callers need to read `.value`. The new `repo` field carries the fetched record's `{ did, pds }` so it can be passed directly to `toHostedBlob` without re-resolving identity. This is shipped as a patch (and not a minor bump) because `0.2.0` was only on npm for ~8 hours and is being deprecated alongside this release, so realistically nobody is depending on the old `fetchRecord` shape.

  Also in this release:
  - New `toHostedBlob({ repo, blob })` for building `com.atproto.sync.getBlob` URLs, plus the `isAtBlob` guard and the `AtBlob` type.
  - `AtProtoRecordRepo` now includes `pds` alongside `did`, so `args.repo` works directly with `toHostedBlob`.
  - `getPds(repo)` is exported and shares the identity cache with `getClient`.
  - `BlobRef` and `CID` instances are flattened to `{ $link }` before being stored, so records with blobs don't break Astro's devalue store.
  - Added the `04-single-entry` example.

## 0.2.0

### Minor Changes

- 54edfb5: Rework the loaders for better ergonomics and typing. Featuring breaking changes!
  - `atProtoLiveLoader` → `defineAtProtoLiveCollection`
  - `atProtoStaticLoader` → `defineAtProtoCollection`

  New capabilities:
  - Multi-source pipeline: load from several `repo` + `collection` pairs in one collection, with `value` discriminated on `collection` inside `filter`/`transform`.
  - Per-source `parseRecord` for `$parse`-style lexicon validation; failures drop the single record without failing the source.
  - `groupBy` + grouped `transform` for merging records across sources under a shared key (e.g. post + reposts).
  - Shared `fetchRecord` hydrator passed to every callback, with per-cycle request deduping.
  - `onSourceError` policy (`'throw' | 'skip' | fn`)
  - `limit: number | 'all'` and `maxPages` for explicit pagination control.

## 0.1.0

### Minor Changes

- 4396993: Introduce `@fujocoded/astro-atproto-loader`, a package for loading AtProto PDS
  records into Astro collections. It includes both `atProtoLiveLoader()` for live
  collections and `atProtoStaticLoader()` for build-time content collections.

## 0.0.1

### Patch Changes

- Initial release of Astro loaders for public AtProto repo records.
