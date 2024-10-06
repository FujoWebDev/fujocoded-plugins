# @fujocoded/astro-rehype-html-headings

Collects headings from a MD(X) file in an Astro environment, similar to how
Astro itself does with its [getHeadings() function](https://docs.astro.build/en/guides/markdown-content/#heading-ids-and-plugins). The headings returned by this plugin, however, also include a `html` properties
that includes the heading rendered to HTML.

> [!IMPORTANT]  
> This `rehype` plugin can only be used in Astro since it relies on the existence of the Astro frontmatter property

### Sample usage

In `astro.config.js`:

```ts
import { astroRehypeHtmlHeadings } from "@fujocoded/astro-rehype-html-headings";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      rehypePlugins: [astroRehypeHtmlHeadings],
    }),
  ],
});
```

In an astro file:

```ts
const chapters = await getCollection("chapters");
chapters.map(async (a) => {
  const rendered = await a.render();
  // The logged result will look like the result of the "getHeadings" Astro function,
  // but will also contain the rendered HTML
  console.log(rendered.remarkPluginFrontmatter.headings);
});
```
