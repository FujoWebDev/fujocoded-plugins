# @fujocoded/remark-excalidraw

A remark plugin that allows loading excalidraw files in markdown

## Sample usage

In `astro.config.js`:

```ts
import remarkExcalidraw from "@fujocoded/remark-excalidraw";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      remarkPlugins: [remarkExcalidraw],
    }),
  ],
});
```

In markdown files:

```md
![alt text](./image-file.excalidraw)
```
