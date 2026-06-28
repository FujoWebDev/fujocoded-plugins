---
"@fujocoded/zod-transform-socials": patch
---

Tighten and extend Bluesky profile URL matching. The `bsky.app`/`bsky.social`
profile form now validates the handle as a real domain and additionally
recognizes DID handles such as `did:plc:…` and `did:web:…`.

Also escapes the literal dots in every platform's match pattern so lookalike
hosts no longer match by accident.
