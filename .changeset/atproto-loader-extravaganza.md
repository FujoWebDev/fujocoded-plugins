---
"@fujocoded/astro-atproto-loader": minor
---

Rework the loaders for better ergonomics and typing. Featuring breaking changes!

- `atProtoLiveLoader` → `defineAtProtoLiveCollection`
- `atProtoStaticLoader` → `defineAtProtoCollection`

New capabilities:

- Multi-source pipeline: load from several `repo` + `collection` pairs in one collection, with `value` discriminated on `collection` inside `filter`/`transform`.
- Per-source `parseRecord` for `$parse`-style lexicon validation; failures drop the single record without failing the source.
- `groupBy` + grouped `transform` for merging records across sources under a shared key (e.g. post + reposts).
- Shared `fetchRecord` hydrator passed to every callback, with per-cycle request deduping.
- `onSourceError` policy (`'throw' | 'skip' | fn`)
- `limit: number | 'all'` and `maxPages` for explicit pagination control.
