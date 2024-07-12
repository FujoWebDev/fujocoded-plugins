# @fujocoded/astro-remark-collect-components

Collects a series of attributes from Astro components used in `.md` or `.mdx`
files and adds a list of them to the Astro `remarkFrontmatter` property for
later usage.

> [!IMPORTANT]  
> This `remark` plugin can only be used in Astro since it relies on the existence of the Astro frontmatter property

### Sample usage

In `astro.config.js`:

```ts
import { astroRemarkCollectComponents } from "@fujocoded/astro-remark-collect-components";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      remarkPlugins: [
        [
          astroRemarkCollectComponents,
          {
            components: [
              {
                // Name of the component
                name: "Callout",
                // Attributes to collect
                attributes: ["title", "slug", "type"],
                // Name of property in remarkPluginFrontmatter where the list of attributes will be stored
                frontmatterName: "callouts",
              },
              {
                name: "ScenarioCallout",
                attributes: ["title", "slug"],
                frontmatterName: "scenarios",
              },
            ],
          },
        ],
      ],
    }),
  ],
});
```

In an astro file:

```ts
const chapters = await getCollection("chapters");
chapters.map(async (a) => {
  const rendered = await a.render();
  console.log(rendered.remarkPluginFrontmatter.callouts);
});
```
