---
"@fujocoded/zod-transform-socials": patch
---

Exports `SocialLinkObjectSchema` so projects can extend the object form of a
social link without rebuilding the whole schema. `SocialLinkInputSchema` is also
available as the clearer name for the default one-item input schema, with
matching `SocialLinkObject` and `SocialLinkInput` types.

Adds standalone examples for preserving custom fields like `label` through
the transform.
