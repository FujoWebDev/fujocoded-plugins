---
"@fujocoded/authproto": patch
---

- Add error handling to OAuth login and callback flows.
- Fix bug where successful logins incorrectly stored an "UNKNOWN" error code in the session.
- Move asDrizzleTable conversion from tables.ts to db store where it's actually used.
