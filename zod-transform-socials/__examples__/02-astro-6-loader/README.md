# Astro 6 loader example

A minimal Astro 6 site with one content collection (`team`) loaded from YAML
files and validated with `SocialLinks` from the package's `/zod4` entry.

## When to look at this code

Your project is on Astro 6, where `astro:content` is built on Zod 4, so
you'll have to import from `@fujocoded/zod-transform-socials/zod4` instead
of the default entry. Don't worry: the library behaves the same way, only
the underlying Zod version changes!

## Run it

1. Install:

   ```bash
   npm install
   ```

2. Build the site (this is what the compat check runs):

   ```bash
   npm run build
   ```

3. Or run the dev server and open the rendered page:

   ```bash
   npm run dev
   ```

## Files to keep an eye on 👀

- `src/content.config.ts` => the only line that differs from the Astro 5
  example is the import path: `@fujocoded/zod-transform-socials/zod4`. The
  collection definition is identical.
- `src/data/team/essential-randomness.yaml` => same input shape as the
  Astro 5 example. The transformer doesn't care which Zod major loaded the
  schema.
- `src/pages/index.astro` => identical to the Astro 5 page. The point of
  this example is that the consumer code stays the same; only the import
  path changes.
