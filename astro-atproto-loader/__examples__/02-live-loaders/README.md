# Live loaders example

This example shows how to use `@fujocoded/astro-atproto-loader` with Astro
live collections.

It reads public AtProto badge records from `atmosphereconf.org` and the
Streamplace data from `essentialrandom.bsky.social` and shows them
on a page with `getLiveCollection()`. The data is collected at request time
and re-fetched periodically.

> [!IMPORTANT]
>
> Astro live collections are still experimental. This example needs
> `experimental.liveContentCollections: true` in `astro.config.mjs`, plus a
> server-capable adapter such as `@astrojs/node`, because live collections are
> rendered on demand.

The page uses the loader two ways:

- `badges` skips `transform` — records flow straight into the collection schema.
- `streams` uses `transform` to fetch the referenced Bluesky announcement post
  for each stream and attach its text and author to the entry.

## Run it

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:4321`.
