# Grouped reposts example

This example merges records from several repos into one Astro live collection
by reading `app.bsky.feed.repost` from three Bluesky accounts and grouping
by the URI of the post each one reposted.

The result is a live page of posts that all three of
[`@fujocoded.bsky.social`](https://bsky.app/profile/fujocoded.bsky.social),
[`@fujoweb.dev`](https://bsky.app/profile/fujoweb.dev), and
[`@bobaboard.bsky.social`](https://bsky.app/profile/bobaboard.bsky.social)
reposted, with the original post hydrated for display.

> [!IMPORTANT]
>
> Astro live collections are still experimental. This example needs
> `experimental.liveContentCollections: true` in `astro.config.mjs`, plus a
> server-capable adapter such as `@astrojs/node`, because live collections are
> rendered on demand.

## What's going on

- `sources: [...]` declares one source per account, all reading the same
  `app.bsky.feed.repost` collection
- `parseRecord` runs once per record and drops anything that isn't a
  well-formed repost. Today this is hand-rolled Zod for `repost`, `post`,
  and `profile`. 
- `groupBy` returns the URI of the post being reposted, so reposts of the
  same post end up in the same group
- The `transform` keeps only groups of size 3, then uses `fetchRecord` to:
  - Add data from the original post (and pull one image off it, if any)
  - Add data about the original post author's profile for their display name
    and avatar
  - Add data from each reposter's profile (their display name and avatar)
- Each entry exposes the post text, an optional thumbnail, the author's
  identity, and a `repostedBy` list with each reposter's `did`, `handle`,
  display name, and avatar URL

`fetchRecord` caches same-URI requests, so fetching profiles per
reposter is cheap even when several entries share a participant.

## Run it

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:4321`.

If the page is empty, the three accounts haven't reposted the same post
within the most recent page of records.
