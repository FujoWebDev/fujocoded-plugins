# @fujocoded/remark-excalidraw

A remark plugin that allows loading excalidraw files in markdown

## TODO:

- [ ] Get component to load excalidraw library
- [ ] Get component to render excalidraw
- [ ] Remove need to manually import component
- [ ] Make astro client load hack configurable

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
