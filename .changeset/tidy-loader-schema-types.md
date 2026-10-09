---
"@fujocoded/astro-atproto-loader": patch
---

Fix the type of the `schema` on collections from `defineAtProtoCollection` and
`defineAtProtoLiveCollection`. It's now exactly the given `outputSchema` instead of
an intersection with Astro's own schema type, so the entry data gets typed correctly.
