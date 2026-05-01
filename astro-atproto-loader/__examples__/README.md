# `@fujocoded/astro-atproto-loader` examples

Small Astro projects that show how to use `@fujocoded/astro-atproto-loader` to
pull public AtProto records into your site.

Pick one, then run `npm install` and `npm run dev` inside that example folder.

## What's in here?

1. [`01-static-loaders`](./01-static-loaders/)
   - Reads public badge records from `community.lexicon.badge.definition` as a
     static `badges` collection, with no `transform`. Records flow straight
     into the schema
   - Pulls in livestream records as a static `streams` collection, using
     `transform` to fetch the referenced Bluesky announcement post at build
     time and attach its text and author to each entry
   - Shows both on a static page with `getCollection()`
2. [`02-live-loaders`](./02-live-loaders/)
   - Reads the same badge records at runtime as a live `badges` collection,
     again with no `transform`
   - Pulls in the same livestream records as a live `streams` collection,
     using `transform` to fetch the Bluesky announcement post
   - Shows both on a server-rendered page with `getLiveCollection()`
   - Requires Astro's live collection flag and a server adapter, so the data
     is fetched on demand when the page is requested
3. [`03-grouped-reposts`](./03-grouped-reposts/)
   - Reads `app.bsky.feed.repost` from three Bluesky accounts at once using
     `sources: [...]`
   - Groups reposts by the URI of the post being reposted using `groupBy`,
     keeps only posts all three accounts reposted, then hydrates the original
     post via `fetchRecord`
   - Shows the result on a server-rendered page with `getLiveCollection()`
4. [`04-single-entry`](./04-single-entry/)
   - Fetches one `actor.rpg.sprite` record by `rkey` with `getEntry()`
     (static) and `getLiveEntry()` (live), instead of loading the whole
     collection
   - Uses `isAtBlob()` and `toHostedBlob()` inside `transform` to turn the
     sprite sheet's blob ref into a URL ready for `<img src>`
   - Shows the result on both a static and a server-rendered page

## Configuring the loaders

To unlock their full power (`source` vs `sources`, `transform`, IDs, handles
vs DIDs), see the [main README](../README.md#configuring-the-loaders).
