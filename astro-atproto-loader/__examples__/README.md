# `@fujocoded/astro-atproto-loader` examples

Small Astro projects that show how to use `@fujocoded/astro-atproto-loader` to
pull public AtProto records into your site.

Pick one, then run `npm install` and `npm run dev`.

## What's in here?

1. [`01-static-loaders`](./01-static-loaders/)
   - reads public badge records from `community.lexicon.badge.definition` as a
     static `badges` collection, with no `transform` — records flow straight
     into the schema
   - pulls in livestream records as a static `streams` collection, using
     `transform` to fetch the referenced Bluesky announcement post at build time
     and attach its text and author to each entry
   - shows both on a static page with `getCollection()`
2. [`02-live-loaders`](./02-live-loaders/)
   - reads the same badge records at runtime as a live `badges` collection,
     again with no `transform`
   - pulls in the same livestream records as a live `streams` collection, using
     `transform` to fetch the Bluesky announcement post
   - shows both on a server-rendered page with `getLiveCollection()`

## Configuring the loaders

To unlock their full power—`source` vs `sources`, `transform`, IDs,
handles vs DIDs—see the [main README](../README.md#configuring-the-loaders).
