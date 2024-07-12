# @fujocoded/remark-jsx-auto-slug

Remark plugin to automatically add a slug to Astro components. Components
should have a `title` prop that is used to generate the slug, and accept
a `slug` prop that they can use wherever they would use a slug.

## Sample usage

In `astro.config.js`:

```ts
import { remarkJsxAutoSlug } from "@fujocoded/remark-jsx-auto-slug";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      remarkPlugins: [
        [
          remarkJsxAutoSlug,
          {
            // Any component name you want this plugin to apply to
            componentNames: ["Callout", "ScenarioCallout"],
          },
        ],
      ],
    }),
  ],
});
```

And in your component e.g. `Callout.astro`:

```ts
interface Props {
  title: string;
  slug?: string;
}

// slug will be automatically available, but won't be overwritten if
// present
const { title, slug } = Astro.props;
```
