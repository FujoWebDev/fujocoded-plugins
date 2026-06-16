---
"@fujocoded/zod-transform-socials": patch
---

Recognize unscoped npm packages. The npm match previously required a scope, so
URLs like `npmjs.com/package/social-links` fell through to `custom`; they now
resolve to the `npm` platform. Underscores are also accepted in package names.
