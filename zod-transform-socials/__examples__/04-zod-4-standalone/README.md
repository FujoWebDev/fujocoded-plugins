# Zod 4 standalone example

A plain Node script that builds a `Member` schema with Zod 4, parses an
inline contacts list, asserts the transformed output, and prints it. No
Astro.

## When to look at this code

You want the schemas in a backend script, a serverless function, or any
plain Node program that already depends on Zod 4. Mirrors the Zod 3
standalone example, except the import comes from
`@fujocoded/zod-transform-socials/zod4`.

## Run it

1. Install:

   ```bash
   npm install
   ```

2. Run the parse script. It asserts the parsed output matches the
   expected shape, then prints the result:

   ```bash
   npm start
   ```

3. Run the type check. This checks the same `parse.ts` file and proves
   the package's `/zod4` exported types resolve correctly under Zod 4:

   ```bash
   npm run typecheck
   ```
