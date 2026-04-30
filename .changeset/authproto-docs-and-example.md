---
"@fujocoded/authproto": patch
---

Fix custom-redirect / referer state parsing in the OAuth callback. The OAuth client wraps our state under an opaque key in the URL `state` param and returns the original value as `clientCallback.state`, so we now read from there instead of `requestUrl.searchParams.get("state")` — which was always the wrapped value and never parsed as JSON.

Also improve `astro-authproto` README and `02-read-bsky-profile` example:

- Document `session` driver setup and full integration config in install steps.
- Clarify `applicationDomain` should be the full URL with scheme (e.g. `https://example.com`, or `http://127.0.0.1:4321` locally).
- Add a "Shipping it" production section.
- Update the read-profile example to use `getBlueskyAgent` from `@fujocoded/authproto/helpers` instead of constructing `AtpBaseClient` directly, and fix the avatar `alt` to use a JSX expression.
