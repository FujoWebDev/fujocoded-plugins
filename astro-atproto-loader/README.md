# `@fujocoded/astro-atproto-loader`

<!-- banner -->

ATproto records meet [Astro](https://docs.astro.build/en/concepts/why-astro/) content collections.
Quick & Easy™

<!-- badges -->

<div align="center">

<a href="https://choosealicense.com/licenses/mit/"> <img alt="NPM license"
    src="https://img.shields.io/npm/l/%40fujocoded%2Fastro-atproto-loader"
  /> </a> <a href="https://fujocoded.com/"> <img
  src="https://img.shields.io/badge/fujo-coded-555555?labelColor=9c89fa"
    alt="FujoCoded badge"/> </a> <a
  href="https://npmjs.com/package/@fujocoded/astro-atproto-loader"> <img
  src="https://badge.fury.io/js/%40fujocoded%2Fastro-atproto-loader.svg"
    alt="NPM version badge"/> </a> <a
  href="https://codespaces.new/FujoWebDev/fujocoded-plugins"> <img
  src="https://github.com/codespaces/badge.svg" alt="Open in GitHub Codespaces"
    style="height: 20px"/> </a>

</div>

> [!IMPORTANT]
>
> This package handles **reads only**. If you also want to write data
> (like posting to Bluesky as a logged-in user), start from
> [`@fujocoded/authproto`](/astro-authproto/README.md).

## What is `@fujocoded/astro-atproto-loader`?

`@fujocoded/astro-atproto-loader` pulls records from any public AtProto PDS
(that is, your repository of AtProto data) straight into your Astro content
collections. Point it at a user handle (e.g. `boba-tan.bsky.social`) or their
DID (e.g. `did:plc:abc123`), tell it which kind of record to read (e.g.
`app.bsky.feed.post`), and use the data on your Astro site like you would with
any content collection!

Under the hood, `@fujocoded/astro-atproto-loader`:

- Resolves a handle to its DID (when needed)
- Resolves that DID or handle to the user's PDS
- Reads records with
  [`com.atproto.repo.listRecords`](https://docs.bsky.app/docs/api/com-atproto-repo-list-records)
  and `getRecord`
- Keeps a short in-memory cache for live collections and refreshes it in the
  background when a request comes in (stale-while-revalidate)

## What's included in `@fujocoded/astro-atproto-loader`?

In this package, you'll find:

- `defineAtProtoLiveCollection()`, which reads public AtProto records at
  request time. Use it where you'd otherwise call Astro's
  `defineLiveCollection()`
- `defineAtProtoCollection()`, which reads public AtProto records at build
  time. Use it where you'd otherwise call Astro's `defineCollection()`

> [!WARNING]
>
> If you're generating your site as static HTML pages (for example for
> Neocities), you must use the static collection loader.

## What can you do with `@fujocoded/astro-atproto-loader`?

- **Pull in content from the wider AtProto network**, including
  [Bluesky](https://bsky.app/) posts, [Streamplace](https://stream.place/)
  VODs, [RPG Actor](https://rpg.actor/about) characters,
  [AtProto badges](https://pdsls.dev/at://did:plc:r2vpg2iszskbkegoldmqa322/community.lexicon.badge.award/i1oZsZlPLWqt0),
  and anything else stored in a public repo (a user's per-protocol record
  store). For example, you can:
  - Pin your favorite Bluesky posts or artist reposts on your homepage
  - Embed your Streamplace VODs next to the articles they inspired
  - Show off the cons you've been badged at, straight from your badge records
- **Show records from multiple repos** in one Astro collection:
  - A list of recent posts both you and your friends liked
  - Profiles of your community members
  - ...and many creative uses!
- **Hydrate linked records** like `strongRef`s and `subject` URIs from inside
  your `transform`, so a post's quoted record or a label's subject is already
  resolved by the time your page renders

> [!TIP]
>
> These utilities should be used when reading one repo, or merging a small
> handful of them. If you find yourself grouping hundreds of records across
> dozens of repos on every request, you probably want an AppView/server that emits
> the pre-aggregated payload, instead of a loader that hits N PDSs each time.

# Setup

Before you start, you'll need:

- Astro 5.13 or later
- An Astro project using the [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/)
- A public AtProto repo and collection NSID (like `com.fujocoded.rolodex.card`)
  to read from

1. Run the following command:

```bash
npm add @fujocoded/astro-atproto-loader
```

2. Define a static collection (for build time magic)...

```ts
// src/content.config.ts
import { z } from "astro:content";
import { defineAtProtoCollection } from "@fujocoded/astro-atproto-loader";

const documents = defineAtProtoCollection({
  source: {
    repo: "bobatan.fujocoded.dev",
    collection: "site.standard.document",
  },
  outputSchema: z.object({
    title: z.string(),
  }),
});

export const collections = { documents };
```

...or a live collection to fetch (almost) every time!

```ts
// src/live.config.ts
import { z } from "astro:content";
import { defineAtProtoLiveCollection } from "@fujocoded/astro-atproto-loader";

const contacts = defineAtProtoLiveCollection({
  source: {
    repo: "did:plc:example1234",
    collection: "com.fujocoded.rolodex.card",
  },
  outputSchema: z.object({
    username: z.string(),
  }),
});

export const collections = { contacts };
```

# Okay how do I _actually_ do stuff with this?

Check out the example sites included under the [examples
folder](./__examples__/).

You can start with any of these:

- [`01-static-loaders`](./__examples__/01-static-loaders/) for
  `defineAtProtoCollection()`, which fetches the data once when your site
  builds (won't update live)
- [`02-live-loaders`](./__examples__/02-live-loaders/) for
  `defineAtProtoLiveCollection()`, which fetches your data at each request
  (updates live)
- [`03-grouped-reposts`](./__examples__/03-grouped-reposts/) for reading from
  multiple repos at once with `sources: [...]` and merging records with
  `groupBy`

The first two examples show off two patterns:

- Passing records through directly and letting Zod validate and transform them
- Reshaping records with a `transform`

The third one shows reading the same collection from three different repos,
grouping records by a shared URI, and hydrating linked records via
`fetchRecord`.

# Configuring the loaders

Both loaders share the same options...mostly.

## Shared options

Each `source` (or each entry in `sources: [...]`) accepts:

- `repo`, required. A DID or a handle
- `collection`, required. The AtProto collection NSID to load
- `parseRecord`, optional. A function that runs once per record before `filter`,
  so you can validate the record's shape. When it throws, that single record is
  dropped with a warning.
- `limit`, optional. Cap on how many records to load from this source.
- `maxPages`, optional. Hard cap on the number of `listRecords` pages that get
  fetched, regardless of `limit`

Use `source: {...}` to read from a single repo, or `sources: [...]` to merge a
handful of repos or collections into one Astro collection.

## About limits

| `limit`           | What you get                                    | Default `maxPages` |
| ----------------- | ----------------------------------------------- | ------------------ |
| (omitted)         | One page, up to 100 records, no cursor walk     | `1`                |
| `number` (e.g. 5) | Stop at that count, page size `min(limit, 100)` | `1`                |
| `'all'`           | Walk every cursor, 100 records per page         | `Infinity`         |

Records rejected by `filter` do not count toward `limit`, but `maxPages` always
caps the raw pagination (so a stray `filter: () => false` can't make the loader
walk forever).

If you want to read every record from a source (just make sure it's only a few):

```ts
source: {
  repo: "did:plc:example1234",
  collection: "com.fujocoded.rolodex.card",
  limit: "all",
}
```

## `parseRecord` vs `transform`

`parseRecord` and `transform` are two different jobs:

- **`parseRecord`** lives on the source. It checks that a raw record has the
  shape you expect, and returns the typed value. It doesn't see `repo`,
  `rkey`, `uri`, or `fetchRecord`, because at that stage it's just answering
  "is this record well-formed?".
- **`transform`** receives the full per-record context plus `fetchRecord`, and
  returns your Astro entry. This is where you do the work: resolving `AtUri`s,
  combining a post with its embed, mapping records to your own
  display model. Return `null` or `undefined` to drop an entry silently

Putting them together:

```ts
import { $parse, lexicons } from "@atproto/lex";

defineAtProtoLiveCollection({
  source: {
    repo: "did:plc:example1234",
    collection: "app.bsky.feed.post",
    parseRecord: (value) => $parse(lexicons, "app.bsky.feed.post", value), // schema gate
  },
  transform: async ({ value, uri, fetchRecord }) => {
    // value is already the parsed lexicon type
    const quoted =
      value.embed?.$type === "app.bsky.embed.record"
        ? await fetchRecord({ atUri: value.embed.record.uri })
        : null;
    return { id: uri, data: { text: value.text, quoted } };
  },
  outputSchema: z.object({ text: z.string(), quoted: z.unknown().nullable() }),
});
```

## `fetchRecord`: hydrating records by AT-URI

Every `filter` and `transform` callback receives `fetchRecord({ atUri, parse?
})`, which fetches a single record from any public PDS by its `AtUri` (the
`at://...` address that uniquely identifies a record on the network). When more
than one callback asks for the _same_ URI in the same cycle (for example a
`subject` URI shared across many records), they share a single network call.

```ts
import { $parse, lexicons } from "@atproto/lex";

transform: async ({ value, uri, fetchRecord }) => {
  const subject = await fetchRecord({
    atUri: value.subject.uri,
    parse: (v) => $parse(lexicons, "app.bsky.actor.profile", v),
  });
  if (!subject) return null; // record was missing, unparseable, or unreachable
  return { id: uri, data: { label: value.val, subject } };
};
```

`fetchRecord` returns `null` for every failure mode: a malformed AT-URI, a
PDS that can't be reached, a 404, a record whose value isn't an object, or a
`parse` callback that threw. Each of these logs a distinct warning to your
console, so when something is missing you can tell which thing went wrong.

## Multi-source reads and `onSourceError`

When you're reading from `sources: [...]`, `onSourceError` decides what
happens if one of those sources fails (PDS is down, repo is gone, and so on).
Use `"skip"` to warn and drop that source's contribution, or `"throw"` to
fail the load:

```ts
defineAtProtoLiveCollection({
  sources: [
    { repo: "fujocoded.bsky.social", collection: "app.bsky.feed.post" },
    { repo: "fujoweb.dev", collection: "app.bsky.feed.post" }, // offline
    { repo: "bobaboard.bsky.social", collection: "app.bsky.feed.post" },
  ],
  onSourceError: "skip",
  outputSchema: z.object({ text: z.string() }),
});
```

The defaults are picked so each loader behaves sensibly out of the box:

- **Live loader:** `sources: [...]` defaults to `"skip"` so one flaky PDS
  doesn't take down your whole live collection. `source: {...}` defaults to
  `"throw"`, because there's no alternate source to fall back to
- **Static loader:** defaults to `"throw"` everywhere, so a broken source
  fails the build instead of quietly publishing partial content. Pass
  `onSourceError: "skip"` if you'd rather ship the rest of the data anyway

You can also pass a function to decide case-by-case:

```ts
onSourceError: (error, source) =>
  source.repo === "critical.test" ? "throw" : "skip",
```

> [!NOTE]
>
> When `onSourceError` is `"throw"`, the first source error fails the whole
> load right away. When you're skipping errors and _every_ source ends up
> failing, the pipeline throws an `AggregateError` so the failure isn't
> swallowed silently. In a live loader, the cache holds onto its last good
> snapshot when a refresh throws, so a transient outage won't blank out
> your page.

## `groupBy`: merging records from multiple sources

When you're reading from `sources: [...]`, you can group records together
before `transform` runs. Every record gets handed to `groupBy`, which returns
a string key. Records that share a key are passed to a single `transform`
call as a group, in `sources[]` declaration order.

For example, here's how you'd find Bluesky posts that all three FujoCoded
accounts reposted, by reading each account's `app.bsky.feed.repost` collection
and grouping by the URI of the post being reposted:

```ts
defineAtProtoLiveCollection({
  sources: [
    { repo: "fujocoded.bsky.social", collection: "app.bsky.feed.repost" },
    { repo: "fujoweb.dev", collection: "app.bsky.feed.repost" },
    { repo: "bobaboard.bsky.social", collection: "app.bsky.feed.repost" },
  ],
  groupBy: ({ value }) => value.subject.uri,
  transform: async ({ key, records, fetchRecord }) => {
    if (records.length < 3) return null; // only keep posts all three reposted
    const post = await fetchRecord({ atUri: key as AtUriString });
    if (!post) return null;

    return {
      id: key,
      data: {
        post,
        repostedBy: records.map((record) => record.repo.did),
      },
    };
  },
  outputSchema: z.object({
    post: z.unknown(),
    repostedBy: z.array(z.string()),
  }),
});
```

A working version of this lives at
[`__examples__/03-grouped-reposts`](./__examples__/03-grouped-reposts/).

Use `filter` to drop records before they reach `groupBy`, or return a unique
key like `uri` for records that shouldn't merge with anything else.

## Default transforms

When the loader is configured with exactly one source and no `transform`, it
defaults to:

```ts
({ value, rkey }) => ({ id: rkey, data: value });
```

When more than one source is configured and no `transform` is provided, the
id is namespaced by `repo.did`, `collection`, and `rkey` so records sharing
an `rkey` across repos or collections don't collide:

```ts
({ value, repo, collection, rkey }) => ({
  id: `${repo.did}/${collection}/${rkey}`,
  data: value,
});
```

The latter is exported as `toNamespacedEntry` if you'd like to compose it
yourself.

## Live-only options

`defineAtProtoLiveCollection()` also accepts:

- `queryFilter`, optional. A request-time filter for
  `getLiveCollection("collection", filter)`. It receives `{ entry, filter }`.
  (This was `loadCollectionFilter` in v0.1)
- `cacheTtl`, optional. Cache lifetime in milliseconds. Defaults to `300000`
  (5 minutes)

# Support Us

You can check out more of our plugins here:

- [Authproto](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/astro-authproto): AtProto authentication for Astro sites
- [Socials plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/zod-transform-socials)
- [Alt text files plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/remark-alt-text-files)

You can also become a patron or buy some merch:

- [Monthly Support](https://fujocoded.com/support)
- [Merch Shop](https://store.fujocoded.com/)
- [RobinBoob](https://www.robinboob.com/)

# Follow Us

<p align="center"><a href="https://twitter.com/fujoc0ded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/twitter.svg" /></a><a href="https://www.tumblr.com/fujocoded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/tumblr.svg" /></a><a href="https://bsky.app/profile/fujocoded.bsky.social"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/bluesky.svg" /></a><a href="https://blorbo.social/@fujocoded"><img width="35"  src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/mastodon.svg" /></a><a href="https://fujocoded.dreamwidth.org/"><img width="17" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/dreamwidth.svg" /></a></p>
