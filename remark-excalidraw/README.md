# @fujocoded/remark-excalidraw

## What is `@fujocoded/remark-excalidraw`?

`@fujocoded/remark-excalidraw` is a remark plugin that turns Markdown image
links to `.excalidraw` files into client-rendered Excalidraw drawings in MDX.
To do that, it:

1. Reads the linked `.excalidraw` file during your build
2. Embeds the drawing content into the generated MDX
3. Imports the Excalidraw React renderer for you
4. Adds width and height when it can read the scene bounds

> [!NOTE]
> If the scene cannot be parsed, the drawing still renders in the browser without
> the extra size hints.

## What's included in `@fujocoded/remark-excalidraw`?

- `remarkExcalidraw`, the default remark plugin
- `PluginArgs`, the options type for the plugin
- `ExcalidrawWrapperOptions`, the options type for wrapping drawings
- `ExcalidrawWrapperContext`, the data passed to wrapper callbacks
- `ExcalidrawComponent` (from `@fujocoded/remark-excalidraw/component`), the
  React component used by generated MDX

## What can you do with `@fujocoded/remark-excalidraw`?

- Keep Excalidraw drawings next to your Markdown and render them as page content
- Give each drawing stable width and height so the page does not jump while the
  renderer loads
- Wrap drawings in your own MDX component for captions, links, zoom controls,
  or layout
- Preserve string HTML attributes that another remark plugin placed on the
  original image

## Setup

1. Run the following command:

   ```bash
   npm install @fujocoded/remark-excalidraw
   ```

2. Add the plugin to your MDX config:

   ```ts
   import mdx from "@astrojs/mdx";
   import remarkExcalidraw from "@fujocoded/remark-excalidraw";
   import { defineConfig } from "astro/config";

   export default defineConfig({
     // ...
     integrations: [
       mdx({
         remarkPlugins: [remarkExcalidraw],
       }),
     ],
   });
   ```

3. Link an Excalidraw file from Markdown:

   ```md
   ![alt text](./image-file.excalidraw)
   ```

## Okay how do I _actually_ see this in action?

Want a small Astro project you can copy from? See
[`__example__/`](./__example__/).

## Configuring wrappers

To put your own component around each drawing, pass `wrapper`:

```ts
import mdx from "@astrojs/mdx";
import remarkExcalidraw from "@fujocoded/remark-excalidraw";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    mdx({
      remarkPlugins: [
        [
          remarkExcalidraw,
          {
            wrapper: {
              name: "ZoomableFigure",
              importPath: "../components/ZoomableFigure.astro",
              attributes: ({ alt, fileName }) => ({
                id: fileName,
                linkLabel: `Open this diagram in another window`,
              }),
            },
          },
        ],
      ],
    }),
  ],
});
```

The wrapper options are:

- **`name`** => Required. Names the MDX component that wraps each drawing
- **`importPath`** => Optional. Imports `name` from this path when you want the
  generated MDX to add the import for you. When omitted, the wrapper is used
  without adding an import
- **`attributes`** => Optional. Adds attributes to the wrapper component. Pass
  an object for fixed attributes, or a function when the attributes need the
  drawing `alt`, `fileName`, `imageUrl`, `markdownPath`, or `sourcePath`
- **`exportPadding`** => Optional. Sets how many pixels of padding are added to
  each side of the inferred drawing bounds. When omitted, the plugin uses `10`
