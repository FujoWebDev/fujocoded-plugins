# `@fujocoded/zod-transform-socials` examples

Each folder is a self-contained example using a different Astro/Zod version.
Pick the one that matches your needs:

- `01-astro-5-loader` => Astro 5 content collection, default entry, Zod 3
- `02-astro-6-loader` => Astro 6 content collection, `/zod4` entry, Zod 4
- `03-zod-3-standalone` => Plain Node script, default entry, Zod 3 (no Astro)
- `04-zod-4-standalone` => Plain Node script, `/zod4` entry, Zod 4 (no Astro)

The two Astro examples read the same YAML team profile through `glob()` and
render the parsed `contacts` array on the index page. The two standalone
examples use `parse.ts` to parse the same input inline, assert the transformed
output, print it, and type-check the package imports.

The standalone examples also include `parse-extension.ts` to show how to extend
`SocialLinkObjectSchema` when you need extra fields to survive the transform.

These also double as the package's compatibility check.
