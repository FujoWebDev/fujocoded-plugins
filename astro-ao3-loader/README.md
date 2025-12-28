# `@fujocoded/astro-ao3-loader`

<div align="center">

Load data from Archive of Our Own to your Astro site.

<!-- Add the <a> so IMGs will stay on the same line -->
<a href="#">
    <img alt="NPM license" src="https://img.shields.io/npm/l/%40fujocoded%2Fastro-ao3-loader" />
</a>
<a href="https://gitpod.io/from-referrer/">
    <img src="https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod" alt="Gitpod Ready-to-Code"/>
</a>
<a href="https://fancoders.com/">
    <img src="https://img.shields.io/badge/fandom-coders-ff69b4" alt="Fandom Coders badge"/>
</a>
<a href="https://npmjs.com/package/@fujocoded/astro-ao3-loader">

![npm version](https://badge.fury.io/js/%40fujocoded%2Fastro-ao3-loader.svg)

</a>
</div>

## What is `@fujocoded/astro-ao3-loader`?

> [!WARNING]
> This is an experimental library with only basic functionality. If you want to help us expand it, you can reach out via GitHub, Fandom Coders, or contacts@fujocoded.com.
>
> If you've never joined an open source project before, this is an excellent first place to contribute!

This plugin uses the [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/) and [AO3.js](https://github.com/fujowebdev/ao3.js) to load data from [Archive of Our Own](https://archiveofourown.org/) to your [Astro](https://astro.build/) website.

## What can `@fujocoded/astro-ao3-loader` do?

| **Method** | **Description** | **Parameters** | **Return Type** |
| ---------- | --------------- | -------------- | --------------- |
| `getFetcher` | Retrieves a | `{ logger: LoaderContext["logger"] }` - An [Astro content loader](https://docs.astro.build/en/reference/content-loader-reference/#loadercontext). | `{ response }` - The HTTP status response from the server. |
| `getNextFicGroupFetcher` | Retrieves a group of works from AO3 using the specified `workIds`. | `{ workIds: string[], logger: LoaderContext["logger"] }` - A list of work IDs and an [Astro content loader](https://docs.astro.build/en/reference/content-loader-reference/#loadercontext). | `{ nextGroup }` - The next group of fics to be loaded. |

You can see an example of its usage [in our sample
repository](https://github.com/FujoWebDev/ao3-content-layer-example).

## Installation

```sh
npm install @fujocoded/astro-ao3-loader
```

## Usage

This package requires Astro 4.14.0 or later. You must enable the experimental
content layer in Astro unless you are using version 5.0.0-beta or later. You can
do this by adding the following to your `astro.config.mjs`:

```javascript
export default defineConfig({
  // ...
  experimental: {
    contentLayer: true,
  },
});
```

Currently, this package contains only a single loader called `worksLoader`,
which loads the details of a series of works whose id is listed in the
`src/content/ao3/works.yaml` file.

First add the configuration in `src/content/config.ts`:

```typescript
// src/content/config.ts
import { defineCollection } from "astro:content";
import { feedLoader } from "@fujocoded/astro-ao3-loader";

export const collections = {
  fanfictions: defineCollection({ loader: worksLoader }),
};
```

Then create your `src/content/ao3/works.yaml` file:

```yaml
- 38226814
- 49238326
- 59988091
- 41160522
- 11728554
- 12928950
- 58869805
```

You can then use this like any other collection in Astro:

```astro
---
import { getCollection } from "astro:content";

const fanfictions = await getCollection("fanfictions");
---

<h1>Hello fujin</h1>
<ul>
  {
    fanfictions.map((fic) =>
      fic.data.locked ? (
        <li>Locked</li>
      ) : (
        <li>{fic.data.title} by {fic.data.authors[0].pseud} ({fic.data.rating})
        </li>
      )
    )
  }
</ul>
```
