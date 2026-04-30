# @fujocoded/authproto

## 0.3.1

### Patch Changes

- 7e3f1e7: Fix custom-redirect / referer parsing in the OAuth callback so encoded
  `redirect` and `referer` values are no longer silently dropped on login.
- 7e3f1e7: Fix custom-redirect / referer state parsing in the OAuth callback. The OAuth client wraps our state under an opaque key in the URL `state` param and returns the original value as `clientCallback.state`, so we now read from there instead of `requestUrl.searchParams.get("state")` — which was always the wrapped value and never parsed as JSON.

  Also improve `astro-authproto` README and `02-read-bsky-profile` example:
  - Document `session` driver setup and full integration config in install steps.
  - Clarify `applicationDomain` should be the full URL with scheme (e.g. `https://example.com`, or `http://127.0.0.1:4321` locally).
  - Add a "Shipping it" production section.
  - Update the read-profile example to use `getBlueskyAgent` from `@fujocoded/authproto/helpers` instead of constructing `AtpBaseClient` directly, and fix the avatar `alt` to use a JSX expression.

- 7e3f1e7: Use Astro's actual dev server port for the OAuth callback URL in development
  instead of always assuming `4321`. If you run `astro dev --port 4322` (or set
  `server.port` in your Astro config), Authproto now points OAuth at the right
  local URL.

## 0.3.0

### Minor Changes

- 4edfdd1: Support Astro 6.
- b728333: Add loggedInClient to Astro.locals and expose the full OAuthSession for the new lex package.

### Patch Changes

- 4edfdd1: Export client metadata domain from config so registered and runtime clients stay consistent.
- b728333: Add input attributes to Login component for better mobile UX (placeholder, inputmode, autocorrect, autocapitalize, autocomplete, spellcheck).
  Allow user to pass down form props to form.
  Partially based on https://tangled.org/strings/did:plc:4gt3dbmp4pydjiemob4konzm/3mihke6jals22

## 0.2.0

### Minor Changes

- 2e1dc6e: Use oauth-client-metadata in place of client-metadata for permission check

### Patch Changes

- 5afb389: Directly return error about missing username field
- 03e7133: Allow using AUTHPROTO_EXTERNAL_DOMAIN to override oauth redirect

## 0.1.4

### Patch Changes

- fc63bca: - Add error handling to OAuth login and callback flows.
  - Fix bug where successful logins incorrectly stored an "UNKNOWN" error code in the session.
  - Move asDrizzleTable conversion from tables.ts to db store where it's actually used.

## 0.1.3

### Patch Changes

- f52de84: Fix issues when not having astro:db installed
