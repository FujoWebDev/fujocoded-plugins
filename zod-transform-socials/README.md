# @fujocoded/zod-transform-socials

Applies a zod transformation to a list of social contacts. Automatically
surfaces website and username, as well as an icon name for usage with `AstroIcon`.

## Sample usage

In content collection (or other Zod bit):

```ts
import { SocialLinks } from "@fujocoded/zod-transform-socials";
// ...

export const teamCollection = defineCollection({
  type: "data",
  schema: (tools) =>
    z.object({
      // ...
      contacts: SocialLinks,
    });
});
```

Yaml file:

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

Usage (look at output for understading):

```ts
const team = await getCollection("team");
team.map((member) => console.log(member.data.contacts));
```

Usage as props:

```ts
import type { SocialLinksData } from "@fujocoded/zod-transform-socials";

interface Props {
  name: string;
  avatar: string;
  contacts: SocialLinksData;
}
```

## Adding custom domains

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
open a PR to add its URL-shape builder to `DOMAIN_PATTERNS` in the library —
that way every consumer benefits and patterns stay correct.

The bare `SocialLinks` / `transformSocial` exports still work and use the
default configuration — only switch to `createSocialsTransformer` when you
need to add domains.
