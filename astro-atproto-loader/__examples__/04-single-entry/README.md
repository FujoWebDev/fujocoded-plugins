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

From this folder:

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:4321` for the static page and `http://127.0.0.1:4321/live`
for the live page.

> [!WARNING]
>
> If you haven't done so already, you'll first need to build `astro-atproto-loader` itself.
> If you don't remember if you have, don't worry: there's no harm in doing so again.
>
> From the `astro-atproto-loader` folder—**not this one!**—run:
>
> 1. `npm install`
> 2. `npm run build`
>
> If all goes well, you will see a bunch of logs and eventually an
> `[astro-atproto-loader] Build complete` message. You can then come back
> to this folder and follow the "run it" section.
