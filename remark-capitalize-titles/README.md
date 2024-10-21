# @fujocoded/remark-capitalize-titles

A version of [this Vercel plugin](https://github.com/vercel/remark-capitalize) that transforms all markdown titles with [title.sh](https://github.com/zeit/title)and also accepts options.

It also allows capitalizing the `title` prop of a given list of Astro components.

By default it uses FujoCoded's own list of capitalization exceptions.

## Sample usage

In `astro.config.js`:

```ts
import remarkCapitalizeTitles from "@fujocoded/remark-capitalize-titles";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      remarkPlugins: [
        [
          remarkCapitalizeTitles,
          {
            // Any component whose title prop should be capitalized
            componentNames: ["Callout", "ScenarioCallout"],
          },
        ],
      ],
    }),
  ],
});
```

### TODOs:

- [ ] Fix issue where a title in a heading that has a previous sibling will be capitalized as if the first
      word was the beginning of the sentence
- [ ] Something like "`head`ing" in titles where the word is compounded with a code thing will capitalize "ing".
