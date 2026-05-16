# @fujocoded/zod-transform-socials

## 0.1.0

### Minor Changes

- [#32](https://github.com/FujoWebDev/fujocoded-plugins/pull/32) [`bbe45a3`](https://github.com/FujoWebDev/fujocoded-plugins/commit/bbe45a3c714c69a9e6ec4f642a89d3cd8137a856) Thanks [@enigmalea](https://github.com/enigmalea)!

  ### New
  - **Zod 4 / Astro 6 support**: `import { SocialLinks } from "@fujocoded/zod-transform-socials/zod4"`. Default entry is still Zod 3.
  - **Examples**: `__examples__/` now has one runnable project per combo (Astro 5, Astro 6, plain Zod 3, plain Zod 4).
  - **`"sideEffects": false`** in `package.json` so you can treeshake away the half you don't use.

  ### Breaking
  - **`zod` is now a peer dep** (`^3.25.0 || ^4.0.0`).
  - **Minimum Zod 3 is now `3.25.0`** (was `3.23.8`) so we can access `zod/v4`.

### Patch Changes

- [#32](https://github.com/FujoWebDev/fujocoded-plugins/pull/32) [`bbe45a3`](https://github.com/FujoWebDev/fujocoded-plugins/commit/bbe45a3c714c69a9e6ec4f642a89d3cd8137a856) Thanks [@enigmalea](https://github.com/enigmalea)!
  - mastodon match now accepts post urls in addition to profile mathes (e.g. urls like `/@user/112050937942786185`).
  - warn at import time when the default (zod 3) entry is used but zod 4 is installed (for example an astro 6 upgrade that forgot to switch to `/zod4`).

## 0.1.0-zod4-test.0

### Minor Changes

- c3e8853: ### New
  - **Zod 4 / Astro 6 support**: `import { SocialLinks } from "@fujocoded/zod-transform-socials/zod4"`. Default entry is still Zod 3.
  - **Examples**: `__examples__/` now has one runnable project per combo (Astro 5, Astro 6, plain Zod 3, plain Zod 4).
  - **`"sideEffects": false`** in `package.json` so you can treeshake away the half you don't use.

  ### Breaking
  - **`zod` is now a peer dep** (`^3.25.0 || ^4.0.0`).
  - **Minimum Zod 3 is now `3.25.0`** (was `3.23.8`) so we can access `zod/v4`.

## 0.0.14

### Patch Changes

- c97f268: Add `createSocialsTransformer` for registering custom domains for platforms without known URL shapes (currently `mastodon`), so self-hosted instances can be matched without needing to spell out `platform` every time.
