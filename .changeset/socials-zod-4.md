---
"@fujocoded/zod-transform-socials": minor
---

### New

- **Zod 4 / Astro 6 support**: `import { SocialLinks } from "@fujocoded/zod-transform-socials/zod4"`. Default entry is still Zod 3.
- **Examples**: `__examples__/` now has one runnable project per combo (Astro 5, Astro 6, plain Zod 3, plain Zod 4).
- **`"sideEffects": false`** in `package.json` so you can treeshake away the half you don't use.

### Breaking

- **`zod` is now a peer dep** (`^3.25.0 || ^4.0.0`).
- **Minimum Zod 3 is now `3.25.0`** (was `3.23.8`) so we can access `zod/v4`.
