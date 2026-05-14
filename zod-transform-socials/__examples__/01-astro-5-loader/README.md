# Astro 5 loader example

A minimal Astro 5 site with one content collection (`team`) loaded from YAML
files and validated with `SocialLinks` from the package's default entry.

## When to look at this code

Your project is on Astro 5, so your `astro:content` schemas are written
against Zod 3. This is the unchanged path: import from
`@fujocoded/zod-transform-socials` (no `/zod4` suffix), and `glob()` keeps
working the way it has.

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

- `src/content.config.ts` => defines the `team` collection and uses
  `SocialLinks` as the schema for `contacts`. This is the line you'd copy
  into your own project.
- `src/data/team/essential-randomness.yaml` => sample input. Covers both
  shapes the schema accepts: a bare URL string, and a
  `{ url, platform }` object (used for Mastodon, where the domain doesn't
  identify the platform).
- `src/pages/index.astro` => calls `getCollection("team")` and renders the
  parsed `contacts`. Each item has `url`, `platform`, `username`, and
  `icon` because the transformer ran during validation.
