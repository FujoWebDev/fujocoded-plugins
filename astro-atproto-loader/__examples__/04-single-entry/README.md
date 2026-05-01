# Single entry example

This example shows how to pull a single AtProto record by `rkey` instead of
loading the whole collection, using `@fujocoded/astro-atproto-loader` with both
`defineAtProtoCollection()` (static) and `defineAtProtoLiveCollection()`
(live).

It reads one `actor.rpg.sprite` record from `bmann.ca` at the `rkey` `self`,
turns the sprite sheet's blob ref into a hosted URL, and renders it on a page
with `<img src>`.

The example uses the loader two ways:

- The static page (`/`) calls `getEntry("sprites-static", "self")` against the
  collection from `content.config.ts`. The record is fetched at build time
- The live page (`/live`) calls `getLiveEntry("sprites-live", "self")` against
  the collection from `live.config.ts`. The record is fetched on each request

Both configs share the same `transform`. It uses `isAtBlob()` to drop the
record if the `spriteSheet` field isn't a blob ref, then `toHostedBlob()` to
turn the blob ref into `{ url, mimeType, size }` ready for `<img src>`.

## Run it

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:4321` for the static page and
`http://127.0.0.1:4321/live` for the live page.

If you want to inspect the built static output instead, run `npm run build`
and then `npm run preview`.
