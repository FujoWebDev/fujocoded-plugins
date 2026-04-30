# @fujocoded/astro-atproto-loader

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
