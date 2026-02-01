# `@fujocoded/astro-ao3-loader`

<div align="center">

Load data from Archive of Our Own to your Astro site.

  <!-- Add the <a> so IMGs will stay on the same line -->
  <a href="https://choosealicense.com/licenses/mit/">
    <img alt="NPM license" src="https://img.shields.io/npm/l/%40fujocoded%2Fastro-ao3-loader" />
  </a>
  <a href="https://fancoders.com/">
    <img src="https://img.shields.io/badge/fandom-coders-ff69b4" alt="Fandom Coders badge"/>
  </a>
  <a href="https://npmjs.com/package/@fujocoded/astro-ao3-loader">
    <img src="https://badge.fury.io/js/%40fujocoded%2Fastro-ao3-loader.svg" alt="Np PM version badge"/>
  </a>
  <a href="https://codespaces.new/FujoWebDev/fujocoded-plugins">
    <img src="https://github.com/codespaces/badge.svg" alt="Open in GitHub Codespaces" style="height: 20px"/>
  </a>
</div>

## What is `@fujocoded/astro-ao3-loader`?

> [!WARNING]
> This is an experimental library with only basic functionality. If you want to help us expand it, you can reach out via GitHub, Fandom Coders, our socials, or contacts@fujocoded.com.
>
> If you've never joined an open source project before, this is an excellent first place to contribute!

This library makes it easy to use the [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/) and [AO3.js](https://github.com/fujowebdev/ao3.js) to load data from [Archive of Our Own](https://archiveofourown.org/) to your [Astro](https://astro.build/) website.

## What can `@fujocoded/astro-ao3-loader` do?

You can use this library to easily grab data about content hosted on [Archive of Our Own](https://archiveofourown.org/) to use in your [Astro](https://astro.build/) site—however you wish to. ✨

The library includes the following loaders:

| **Loader**     | **Description**                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| `worksLoader`  | Loads data from a set of works hosted on [Archive of Our Own](https://archiveofourown.org/). |
| `seriesLoader` | Loads data from series hosted on [Archive of Our Own](https://archiveofourown.org/).         |

## How to use `@fujocoded/astro-ao3-loader`

> [!TIP]
> Want to see some examples? Take a look around the [examples folder](/astro-ao3-loader/__examples__/). 👀

### Prerequisites

This library requires [Astro](https://astro.build/) 5.0.0 or later, and Astro's built-in [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/). Astro 4 isn't currently supported, but if you'd like to use the library on an older version, [open an issue](https://github.com/FujoWebDev/fujocoded-plugins/issues/new?labels=ao3-content-loader) to let us know!

### Installation

```bash
npm install @fujocoded/astro-ao3-loader
```

### Configuration

The configuration steps are the same for each [loader](#what-can-fujocodedastro-ao3-loader-do). In this example, we'll use the `worksLoader` to get information from a list of works specified in `src/content/ao3/works.yaml`.

1. Set up a content collection in `src/content/config.ts` that uses your chosen loader.

   ```ts
   import { defineCollection } from "astro:content";
   import { worksLoader } from "@fujocoded/astro-ao3-loader";

   export const collections = {
     fanfictions: defineCollection({ loader: worksLoader }),
   };
   ```

2. Create `src/content/ao3/works.yaml` and add a list of work IDs to the file.

   ```yaml
   - 38226814
   - 49238326
   - 59988091
   - 41160522
   - 11728554
   - 12928950
   - 58869805
   ```

> [!TIP]
> This file uses the YAML data format to list work IDs. If you're running into issues, check your syntax using one of the many YAML validators out there.

Once configured, you can use the `astro-ao3-loader` like any other Astro collection.

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

For a more complete example, you can take a look at [our example directory](/astro-ao3-loader/__examples__/astro-5/src/pages/index.astro).
