---
"@fujocoded/zod-transform-socials": patch
---

- mastodon match now accepts post urls in addition to profile mathes (e.g. urls like `/@user/112050937942786185`).
- warn at import time when the default (zod 3) entry is used but zod 4 is installed (for example an astro 6 upgrade that forgot to switch to `/zod4`).
