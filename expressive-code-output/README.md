# @fujocoded/expressive-code-output

Allows separating code in an expressive code block from its output.

When this plugin is installed adding the `withOutput` attribute to a block will enable "output mode". In this mode, actual code must be preceded by the `> ` string. The first line that does not start with `> ` is where the output will start.

### Sample usage

In `astro.config.js`:

```ts
import { pluginCodeOutput } from "@fujocoded/expressive-code-output";

export default defineConfig({
  // ...
  integrations: [
    starlight({
      expressiveCode: {
        plugins: [pluginCodeOutput()],
      },
    }),
  ],
});
```

In a markdown file:

````md
Here is a code sample:

```bash withOutput
> pwd

/usr/home/boba-tan/programming
```
````

This will create a code block with only the `pwd` command in it (without `> `) followed by another block containing the output.
