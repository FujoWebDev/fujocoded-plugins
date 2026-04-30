---
"@fujocoded/authproto": patch
---

Fix custom-redirect / referer parsing in the OAuth callback so encoded
`redirect` and `referer` values are no longer silently dropped on login.
