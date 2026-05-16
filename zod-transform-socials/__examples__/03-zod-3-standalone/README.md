# Zod 3 standalone example

A plain Node script that builds a `Member` schema with Zod 3, parses an
inline contacts list, asserts the transformed output, and prints it. No
Astro.

## When to look at this code

You want to use the schemas outside an Astro project, in a backend script,
a serverless function, or any plain Node program that already depends on
Zod 3. This example shows the package working with no framework wrapping
it: you build the schema, you call `.parse()`, you read the result.

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
   the package's exported types resolve correctly under Zod 3:

   ```bash
   npm run typecheck
   ```
