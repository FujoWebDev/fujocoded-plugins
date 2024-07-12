# @fujocoded/expressive-code-caption

Allows adding a caption for a code block that uses expressive code, delineated by `---` block fences.

Simple markdown formatting is supported within the caption.

> [!IMPORTANT]
>
> 1. The code fence must end at the last line before the code block is closed.
> 2. You should put this plugin as early as possible in the list of plugins to minimize the chance that other plugins will interfere with it and viceversa.

### Sample usage

In `astro.config.js`:

```ts
import { pluginCodeCaption } from "@fujocoded/expressive-code-caption";

export default defineConfig({
  // ...
  integrations: [
    starlight({
      expressiveCode: {
        plugins: [pluginCodeCaption()],
      },
    }),
  ],
});
```

In a markdown file:

````md
Here is a code sample:

```bash
pwd

---
After pressing enter, the `pwd` command will output the current directory
your terminal is in.
---
```
````

This will add a `figcaption` element as last child of the rendered terminal with the sentence between the `---` fences.
