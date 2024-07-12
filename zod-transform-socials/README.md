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
