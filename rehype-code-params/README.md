# @fujocoded/rehype-code-params

Rehype plugin to style param vaues in inline code blocks. It does so by wrapping
any value between `[]` brackets within inline code blocks in a `<span>`.

## Sample usage

In `astro.config.js`:

```ts
import { rehypeCodeParams } from "@fujocoded/rehype-code-params";

export default defineConfig({
  // ...
  integrations: [
    mdx({
      rehypePlugins: [rehypeCodeParams],
    }),
  ],
});
```

In an `.md(x)` file:

```md
This code has a param: `git commit -m "[commit_message]"`
```

This will output the following HTML for the code block:

```html
<code>git commit -m "<span class="rehype-param">[commit_message]</span>"</code>
```
