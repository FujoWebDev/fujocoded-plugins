---
"@fujocoded/astro-atproto-loader": patch
---

Fixes `0.2.0`, which was broken: `defineAtProtoCollection` and `defineAtProtoLiveCollection` didn't return the shape Astro expected, so callers had to wrap them in `defineCollection` / `defineLiveCollection` themselves. They now return the real Astro collection shape and work as documented.

**Breaking:** `fetchRecord({ atUri })` now resolves to `{ value, repo }` instead of just the record value. Existing callers need to read `.value`. The new `repo` field carries the fetched record's `{ did, pds }` so it can be passed directly to `toHostedBlob` without re-resolving identity. This is shipped as a patch (and not a minor bump) because `0.2.0` was only on npm for ~8 hours and is being deprecated alongside this release, so realistically nobody is depending on the old `fetchRecord` shape.

Also in this release:

- New `toHostedBlob({ repo, blob })` for building `com.atproto.sync.getBlob` URLs, plus the `isAtBlob` guard and the `AtBlob` type.
- `AtProtoRecordRepo` now includes `pds` alongside `did`, so `args.repo` works directly with `toHostedBlob`.
- `getPds(repo)` is exported and shares the identity cache with `getClient`.
- `BlobRef` and `CID` instances are flattened to `{ $link }` before being stored, so records with blobs don't break Astro's devalue store.
- Added the `04-single-entry` example.
