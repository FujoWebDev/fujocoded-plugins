# Static loaders example

This example shows how to use `@fujocoded/astro-atproto-loader` with Astro
content collections via `defineAtProtoCollection()`.

It reads public AtProto badge records from `atmosphereconf.org` and the
Streamplace data from `essentialrandom.bsky.social` at build time and shows them
on a static page with `getCollection()`.

The page uses the loader two ways:

- `badges` skips `transform`. Records flow straight into the collection schema
  without any extra configuration
- `streams` uses `transform` to fetch the referenced Bluesky announcement post
  for each stream and attach its text and author to the entry

## Run it

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:4321`.

If you want to inspect the built static output instead, run `npm run build`
and then `npm run preview`.
