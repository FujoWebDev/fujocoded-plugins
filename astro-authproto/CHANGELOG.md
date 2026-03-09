# @fujocoded/authproto

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
