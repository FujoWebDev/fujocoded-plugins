# @fujocoded/authproto

## 0.1.4

### Patch Changes

- fc63bca: - Add error handling to OAuth login and callback flows.
  - Fix bug where successful logins incorrectly stored an "UNKNOWN" error code in the session.
  - Move asDrizzleTable conversion from tables.ts to db store where it's actually used.

## 0.1.3

### Patch Changes

- f52de84: Fix issues when not having astro:db installed
