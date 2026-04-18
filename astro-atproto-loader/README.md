# `@fujocoded/astro-atproto-loader`

<!-- banner -->

AtProto records meet [Astro](https://docs.astro.build/en/concepts/why-astro/) content collections.
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
> This package handles **public reads only**. If you also want to write data
> (like posting to Bluesky as a logged-in user), you'll want to start from
> [`@fujocoded/authproto`](/astro-authproto/README.md).

## What is `@fujocoded/astro-atproto-loader`?

`@fujocoded/astro-atproto-loader` pulls records from any public AtProto PDS
straight into your Astro content collections. Point it at a handle or DID,
choose your AtProto collection NSID, and use the data on your Astro site like
you would with any content collection.

Under the hood, `@fujocoded/astro-atproto-loader`:

- resolves a handle to its DID (when needed)
- resolves that DID to the repo's PDS
- reads records with [`com.atproto.repo.listRecords`](https://docs.bsky.app/docs/api/com-atproto-repo-list-records) and `getRecord`
- keeps a short in-memory cache and refreshes it in the background when a
  request happens (stale-while-revalidate)

## What's included in `@fujocoded/astro-atproto-loader`?

In this package, you'll find:

- `atProtoLiveLoader()`, which reads public AtProto records at request time,
  for use with `defineLiveCollection()`.
- `atProtoStaticLoader()`, which reads public AtProto records at build time,
  for use with `defineCollection({ loader })`.

## What can you do with `@fujocoded/astro-atproto-loader`?

- **Pull in content from the wider AtProto network**, including
  [Bluesky](https://bsky.app/) posts, [RPG Actor](https://rpg.actor/about)
  characters, [AtProto badges](https://pdsls.dev/at://did:plc:r2vpg2iszskbkegoldmqa322/community.lexicon.badge.award/i1oZsZlPLWqt0),
  and anything else stored in a public repo. For example, you can:
  - Pin your favorite Bluesky posts or artist reposts on your homepage
  - Embed your [Streamplace](https://stream.place/) VODs next to the articles they inspired
  - Show off the cons you've been badged at, straight from your badge records
- **Show records from multiple repos** into one Astro collection:
  - A list of recent posts both you and your friends liked
  - Profiles of your community members
  - ...and many creative uses!

# Getting started

## Pre-requisites

- Astro 5.13 or later
- An Astro project using the [Content Loader
  API](https://docs.astro.build/en/reference/content-loader-reference/)
- A public AtProto repo and collection NSID (like `com.fujocoded.rolodex.card`) to read from

## Installation

1. Run the following command:

```bash
npm add @fujocoded/astro-atproto-loader
```

2. Define a collection with one of the loaders. For a live collection:

```ts
// src/live.config.ts
import { defineLiveCollection, z } from "astro:content";
import { atProtoLiveLoader } from "@fujocoded/astro-atproto-loader";

const contacts = defineLiveCollection({
  loader: atProtoLiveLoader({
    source: {
      repo: "did:plc:example1234",
      collection: "com.fujocoded.rolodex.card",
    },
  }),
  schema: z.object({
    message: z.string(),
  }),
});

export const collections = { contacts };
```

...or for a static collection:

```ts
// src/content.config.ts
import { defineCollection, z } from "astro:content";
import { atProtoStaticLoader } from "@fujocoded/astro-atproto-loader";

const documents = defineCollection({
  loader: atProtoStaticLoader({
    source: {
      repo: "bobatan.fujocoded.dev",
      collection: "site.standard.document",
    },
  }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { documents };
```

# Okay how do I _actually_ do stuff with this?

Check out the example sites included under the [examples
folder](./__examples__/).

You can start with either:

- [`01-static-loaders`](./__examples__/01-static-loaders/) for `defineCollection({ loader })`, which will fetch the data once when your site builds (won't update live)
- [`02-live-loaders`](./__examples__/02-live-loaders/) for `defineLiveCollection()`, which will fetch your data at each request (updates live)

Both examples show off two patterns:

- passing records through directly and letting Zod validate and transform them
- reshaping records with a loader `transform`

> [!WARNING]
>
> If you're generatic your site as static HTML pages, for example for neocities,
> you must use a static loader

# Configuring the loaders

Both loaders share the same option...mostly.

## Shared options

- `source`, required for the simplest case. A single AtProto source with:
  - `repo`, required. A DID or a handle.
  - `collection`, required. The AtProto collection NSID to load.
  - `limit`, optional. Cap the number of entries loaded from this source.
    Records rejected by `filter` do not count toward the limit. Records in a
    collection are returned newest-first by rkey, so `limit: 5` gives you the
    5 most recent.
- `sources`, use this instead of `source` when you want to merge multiple
  public repos or collections into one Astro collection. Each source in the
  array accepts the same fields as `source` (including `limit`, applied
  per-source).

- `transform`, optional. Turns a raw AtProto record into an Astro entry. It
  receives one object with `value`, `repo`, `collection`, `did`, `rkey`, `uri`,
  and `cid`.
  - For `atProtoLiveLoader()`, return a `LiveDataEntry` (`{ id, data, rendered?,
cacheHint? }`).
  - For `atProtoStaticLoader()`, return an `AtProtoStaticDataEntry` (`{ id,
data, body?, filePath? }`).
- `filter`, optional. Skip records before they are transformed. It receives the
  same object-style callback argument as `transform`.

When `source` is used without `transform`, the loader defaults to:

```ts
({ value, rkey }) => ({
  id: rkey,
  data: value,
});
```

When `sources` is used without `transform`, the loader namespaces the id by
`did` and `collection` so records with the same `rkey` from different repos or
collections don't collide:

```ts
({ value, did, collection, rkey }) => ({
  id: `${did}/${collection}/${rkey}`,
  data: value,
});
```

This is exported as `getNamespacedEntry` if you want to compose it yourself.

## Live-only options

`atProtoLiveLoader()` also accepts:

- `loadCollectionFilter`, optional. Applies request-time filtering for
  `getLiveCollection("collection", filter)`. It receives `{ entry, filter }`.
- `cacheTtl`, optional. Cache lifetime in milliseconds. Defaults to `60000`
  (1 minute).

# Support Us

You can check out more of our plugins here:

- [Authproto](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/astro-authproto) — AtProto authentication for Astro sites
- [Socials plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/zod-transform-socials)
- [Alt text files plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/remark-alt-text-files)

You can also become a patron or buy some merch:

- [Monthly Support](https://fujocoded.com/support)
- [Merch Shop](https://store.fujocoded.com/)
- [RobinBoob](https://www.robinboob.com/)

# Follow Us

<p align="center"><a href="https://twitter.com/fujoc0ded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/twitter.svg" /></a><a href="https://www.tumblr.com/fujocoded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/tumblr.svg" /></a><a href="https://bsky.app/profile/fujocoded.bsky.social"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/bluesky.svg" /></a><a href="https://blorbo.social/@fujocoded"><img width="35"  src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/mastodon.svg" /></a><a href="https://fujocoded.dreamwidth.org/"><img width="17" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/dreamwidth.svg" /></a></p>
