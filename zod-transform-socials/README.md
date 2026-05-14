# @fujocoded/zod-transform-socials

Transforms a list of social media contacts into a list of username +
website name + site icon with the power of Zod transforms (and, optionally,
Astro).

## Setup

1. Install the package:

   ```bash
   npm install @fujocoded/zod-transform-socials
   ```

   > [!IMPORTANT]
   >
   > For non-Astro projects, if you see `Cannot find module 'zod'`,
   > it means you need should add `zod` to your own `package.json`.
   >
   > ```bash
   > # Zod 3 projects
   > npm install @fujocoded/zod-transform-socials zod@^3.25.0
   >
   > # Zod 4 projects
   > npm install @fujocoded/zod-transform-socials zod@^4.0.0
   > ```
   >
   > Starting with `v0.1.0`, `zod` is a peer dependency and doesn’t
   > get packaged with this library anymore.

2. Pick the entry that matches the `zod` in your project:

   - **Astro 5 / Zod 3** => `import { SocialLinks } from "@fujocoded/zod-transform-socials"`
   - **Astro 6 / Zod 4** => `import { SocialLinks } from "@fujocoded/zod-transform-socials/zod4"`

## How to use it

> [!NOTE]
> Want a project you can copy from? The
> [`__examples__/`](./__examples__) folder has one per Astro / Zod
> combination:
>
> - [`01-astro-5-loader`](./__examples__/01-astro-5-loader) => Astro 5 (Zod 3)
> - [`02-astro-6-loader`](./__examples__/02-astro-6-loader) => Astro 6 (Zod 4)
> - [`03-zod-3-standalone`](./__examples__/03-zod-3-standalone) => plain Node + Zod 3
> - [`04-zod-4-standalone`](./__examples__/04-zod-4-standalone) => plain Node + Zod 4

### 1. List the contacts

Write down the data however you or your content collection want to load it.
For example, with YAML:

```yaml
name: essential-randomness
contacts:
  - https://essentialrandomness.com
  - https://essential-randomness.tumblr.com
  - https://twitter.com/essentialrandom
  - url: https://indiepocalypse.social/@essentialrandom
    platform: mastodon
  - https://github.com/essential-randomness
  - https://patreon.com/essentialrandomness
  - https://ko-fi.com/essentialrandomness
```

In this list, each item must be either:

- a user’s social profile URL (a bare string), **or**
- an object with an URL + a series of (optional) overrides:
  - **`url`** (required) => the social profile URL.
  - **`platform`** (optional) => use when the URL alone can’t identify the
    platform. For exampke, Mastodon instances live on arbitrary domains.
  - **`icon`** (optional) => use when you want a different icon than the
    default for that platform, or any icon at all for a URL that would
    otherwise resolve to `"custom"`. Any [`AstroIcon`](https://www.astroicon.dev/)
    name works (e.g. `simple-icons:firefox`).
  - **`username`** (optional) => use when the URL doesn’t carry a handle the
    transformer knows how to extract, or the one it extracted is wrong.

For example, putting a custom icon on a personal homepage that would
otherwise resolve to `"custom"` with no icon:

```yaml
contacts:
  - url: https://essentialrandomness.com
    icon: simple-icons:firefox
```

### 2. Define the schema

Drop `SocialLinks` into a content collection (or any other Zod object):

```ts
import { SocialLinks } from "@fujocoded/zod-transform-socials";
// zod import,

export const teamCollection = defineCollection({
  type: "data",
  schema: (tools) =>
    z.object({
      name: z.name(),
      // contacts is
      contacts: SocialLinks,
    });
});
```

### 3. Read the parsed contacts

```ts
const team = await getCollection("team");

for (const member of team) {
  for (const contact of member.data.contacts) {
    console.log(contact.platform, contact.username, contact.url);
  }
}
```

Each `contact` in `member.data.contacts` has been transformed from the
raw input into a flat object with four fields:

```ts
{
  url: "https://essential-randomness.tumblr.com",
  platform: "tumblr",
  username: "essential-randomness",
  icon: "simple-icons:tumblr",
}
```

- **`url`** => whatever the input URL was
- **`platform`** => the matched platform name (`"tumblr"`, `"github"`,
  `"mastodon"`, etc.), or `"custom"` if nothing matched
- **`username`** => extracted from the URL where possible, otherwise
  `null`
- **`icon`** => a ready-to-use [`AstroIcon`](https://www.astroicon.dev/)
  name (e.g. `simple-icons:tumblr`), or `null` for `"custom"`

You can find the full list of platform names the transformer recognises in the
`SOCIAL_TYPES` union in [`src/social-links.ts`](./src/social-links.ts).

## Extra stuff

### Typing component props

To hint at the shape of this data (for example when passing contacts to a component) use the exported `SocialLinksData` type:

```ts
import type { SocialLinksData } from "@fujocoded/zod-transform-socials";

interface Props {
  name: string;
  avatar: string;
  contacts: SocialLinksData;
}
```

## Setting known domains

For platforms without a fixed domain, like `mastodon`, the built-in matchers
can only know a fixed set of domains (e.g. `mastodon.social`,
`mastodon.world`). If you use a different instance and you're tired of
spelling out `platform: mastodon` every time, you can use `createSocialsTransformer`
and pass platform domains via `domains`:

```ts
import { createSocialsTransformer } from "@fujocoded/zod-transform-socials";

const { SocialLinks, transformSocial } = createSocialsTransformer({
  domains: {
    mastodon: ["blorbo.social", "tech.lgbt", "indiepocalypse.social"],
  },
});

export const teamCollection = defineCollection({
  type: "data",
  schema: (tools) =>
    z.object({
      // ...
      contacts: SocialLinks,
    }),
});
```

Only platforms with a registered URL shape can be configured this way
(currently: `mastodon`). If you need a platform that isn't covered, please
open a PR to add its URL-shape builder to `DOMAIN_PATTERNS` in the library.
