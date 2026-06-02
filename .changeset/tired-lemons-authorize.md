---
"@fujocoded/authproto": minor
---

Add scoped login controls, an Authorize component for requesting extra
permissions after login, and helpers for building ATProto permission scopes.

## Breaking changes

- Login and logout now default to returning users to the referring page instead
  of `/`. Set `redirects.afterLogin` and `redirects.afterLogout` to `/` to keep
  the old behavior.
- `<Login />` no longer defaults the input placeholder to `handle.bsky.social`;
  pass `placeholder="handle.bsky.social"` if you want that exact prompt.
- `Astro.locals.loggedInUser` now includes a required `scopes` array. Update
  tests, mocks, and custom local assignments to include `scopes: []` when no
  grants are needed.
