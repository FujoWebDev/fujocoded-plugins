# @fujocoded/remark-alt-text-files

A remark plugin that allows loading alt text from a file, rather than hardcoding it in markdown

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
- `sourceLocation`: path or URL prefix to prepend to generated source metadata
- `targetAttribute`: set to `true` to write source metadata to
  `data-alt-source`, or pass a custom HTML attribute name (default: `false`)
- `missingFile`: what to do when an alt text file cannot be loaded: `"error"`
  (default), `"warn"`, or `"ignore"`

## Writing alt source metadata (optional)

This plugin can be configured to add the original alt text source path to each
image it resolves using `targetAttribute`.

This defaults to `false`. Set it to `true` to write `data-alt-source`, or pass
another attribute name to customize the output.

### Writing the default `data-alt-source` attribute

```ts
import remarkAltTextFiles from "@fujocoded/remark-alt-text-files";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      remarkPlugins: [
        [
          remarkAltTextFiles,
          {
            root: "./src/content",
            sourceLocation: "src/content",
            targetAttribute: true,
          },
        ],
      ],
    }),
  ],
});
```

For a markdown image like this:

```md
![file:../assets/cover.alt.txt](../assets/cover.png)
```

The plugin loads the alt text as usual and adds:

```html
<img
  src="../assets/cover.png"
  alt="..."
  data-alt-source="src/assets/cover.alt.txt"
/>
```

### Point source metadata at GitHub

You can also use a full URL . For example, when the metadata should point at
files in a hosted repo:

```ts
[
  remarkAltTextFiles,
  {
    sourceLocation: "https://github.com/owner/repo/blob/main/src/content",
  },
];
```

That emits `data-alt-source` values like
`https://github.com/owner/repo/blob/main/src/content/assets/cover.alt.txt`.

### Build source metadata yourself

Use a function when a path or URL prefix is not enough:

```ts
[
  remarkAltTextFiles,
  {
    sourceLocation({ altPath, imagePath, markdownPath, resolvedAltPath }) {
      const repo = getRepoFromPath(markdownPath);
      return `https://github.com/owner/${repo}/blob/main/${altPath}`;
    },
  },
];
```
