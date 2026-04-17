---
"@fujocoded/zod-transform-socials": patch
---

Add `createSocialsTransformer` for registering custom domains for platforms without known URL shapes (currently `mastodon`), so self-hosted instances can be matched without needing to spell out `platform` every time.
