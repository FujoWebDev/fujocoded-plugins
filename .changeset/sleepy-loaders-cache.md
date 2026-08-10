---
"@fujocoded/astro-atproto-loader": patch
---

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
