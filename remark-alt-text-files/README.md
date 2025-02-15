# @fujocoded/remark-alt-text-files

A remark plugin that allows loading alt text from a file, rather than hardocding it in markdown

## Sample usage

In `astro.config.js`:

```ts
import remarkAltTextFiles from "@fujocoded/remark-alt-text-files";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      remarkPlugins: [remarkAltTextFiles],
    }),
  ],
});
```

In markdown files:

```md
![regular alt text](./image.png)

![file:path/to/alt/text.alt.txt](./image.png)

# This will load alt text from "./image.alt.txt"

![file:](./image.png)
```

You can change the following options:

- `root`: where the alt text file will be searched from (default: the loaded path of the markdown file or `process.cwd()`)
- `pathPrefix`: the prefix to indicate alt text should be loaded from a file (default: `file:`)
