# @fujocoded/astro-dev-only

An Astro integration to remove files from your final static production build.
Useful for drafts or other dev-only pages.

> [!WARNING]
> This is an experimental library with basic functionality. Expect
> rough edges.

## Installation

```sh
npm install @fujocoded/astro-dev-only
```

## Usage

Add the integration to your `astro.config.mjs` file (or similar) and list the
routes you want to remove from the final build via `routePatterns`. Accepts both
strings (full match, with optional `index.html`) and RegExp.

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import devOnlyRoutes from "@fujocoded/astro-dev-only";

export default defineConfig({
  integrations: [
    devOnlyRoutes({
      routePatterns: [
        // For static routes, this will remove the page generated from either
        // - src/pages/your-eyes-only.astro
        // - src/pages/your-eyes-only.html
        "/your-eyes-only",
        // For static routes, this will remove any route generated from within src/pages/drafts
        /^\/drafts\//,
        // Dynamic routes are also supported, in both modes
        // NOTE: it's currently not possible to remove only SOME generated paths from a route. PR welcome!
        "/dynamic/[...pages]",
      ],
    }),
  ],
});
```

The integration works by literally deleting files from the resulting builds.
It's not pretty, but it works. See notes and limitations.

> [!IMPORTANT]
> Want to be safe? This integration supports a `dryRun` flag. Set
> it and the integration will just print the path of the files to delete! The
> actual files will remain!
>
> ```ts
> devOnlyRoutes({
>   dryRun: true,
>   // ...
> });
> ```

## Notes and limitations

Given the crude implementation, a few words of caution:

- This integration only removes the generated page files. It does not
  automatically remove references to those pages (e.g., sitemap entries, nav
  links, RSS).
- Assets are also not removed
- All dev-only pages are still built for production, which means any slowness
  caused by them won't be helped by this plugin
