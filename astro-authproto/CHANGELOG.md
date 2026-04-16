# @fujocoded/authproto

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
