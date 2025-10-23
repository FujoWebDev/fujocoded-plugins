# `@fujocoded/authproto`

<!-- banner -->

ATproto authentication for your [Astro](https://docs.astro.build/en/concepts/why-astro/) site. Free and Easy™!

<!-- badges -->

## What is `@fujocoded/authproto`?

`@fujocoded/authproto` allows your visitors to log into your website using their
account on any ATproto services (like Bluesky) or in technical terms their PDS!

Under the hood, `@fujocoded/authproto` adds OAuth authentication to your site
through
[`@atproto/oauth-client-node`](https://www.npmjs.com/package/@atproto/oauth-client-node),
then uses Astro's session adapters (based on
[`@unjs/unstorage`](https://github.com/unjs/unstorage)) to store your visitor's
credentials.

<!-- screenshot of oauth x'd out -->
<!-- screenshot of fujocoded thumbsup -->

## What's included in `@fujocoded/authproto`?

In this package, you'll find:

- `@fujocoded/authproto`, an Astro integration that:
  - Adds the authentication routes you need
  - Lets you easily access the DID and handle of a logged in user, if any
- `@fujocoded/authproto/components`, which includes:
  - A basic login/logout component to get started quickly
- `@fujocoded/authproto/helpers`,
  - `getPdsAgent` authorizes a logged in user to post, update, or delete data from ATProto
  - `friendsOnly` finds mutuals from your [Bluesky](https://bsky.app/) account

## What can you do with `@fujocoded/authproto`?

- **Let visitors log in to your site** with their ATproto account (such as a Bluesky
  account). With this, you can:
  - Build private, friends-only spaces and pages
  - Gate certain content from the public
- **Read data from other ATproto services**, including [Bluesky](https://bsky.app/),
  [Streamplace](https://stream.place/), [Teal.FM](https://teal.fm/), and more!
  Among the many uses, you can:
  - Show a list of your favorite [Bluesky](https://bsky.app/) posts, or
    embed [Leaflet publications](https://leaflet.pub/)
  - Tell everyone about the music you love by listing
    your [Rocksky](https://rocksky.app/) stats
- **Create, update, and delete data** on ATproto services, both existing ones or
  _your own_!
  - Post on [Bluesky](https://bsky.app/) from your own website
  - Build [guestbooks](https://github.com/FujoWebDev/lexicon-guestbook/) that
    others on ATproto can interact with
  - Make your _own_ ATproto app that shares data with the rest of the network

<!-- replace this with a fancier display -->
<!-- link to atproto explainer -->

## Built with Authproto

- [Guestbook lexicons](https://github.com/FujoWebDev/lexicon-guestbook/)
- [Fanfic archive](https://github.com/haetae-bit/fanfic-atproto)

# Getting started

## Pre-requisites

- Node
- NPM/pnpm/yarn
- Terminal
- [Server adapter](https://docs.astro.build/en/guides/on-demand-rendering/#server-adapters) to set up login/logout sessions
- (Optional) [session driver](https://docs.astro.build/en/reference/configuration-reference/#sessiondriver) to allow users to log in or log out

> [!IMPORTANT]
> `deno` requires a workaround due to a CJS/ESM import issue within
> `@atproto/oauth-client-node`.

> [!IMPORTANT]
> Using either `localStorage` or `sessionStorage` will result in a ["Session storage could not be initialized." error](https://docs.astro.build/en/reference/errors/session-storage-init-error/) (and is considered insecure for handling sessions anyway). Consider other options, like a database.

Requires some familiarity with Astro, but if you want to jump in head first:

### Automatic Installation

1. Run the following command:

```bash
npx astro add @fujocoded/authproto
```

This will automatically install `@fujocoded/authproto` and add the integration to your `astro.config.mjs` file.

> [!TIP]
> 
> You can take a look at all the [possible configuration options below](#configuration-options).

### Manual Installation

1. Run the following command:

```bash
npm add @fujocoded/authproto
```

2. Add the integration to your `astro.config.mjs` file, like this:

```js
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
+ import authproto from "@fujocoded/authproto";

export default defineConfig({
  output: "server", // you can read up more how this works here: https://docs.astro.build/en/guides/on-demand-rendering/
  adapter: node({ mode: "standalone" }), // ... or whichever adapter you're using!
+ integrations: [
+   authproto({
+     // config options here
+   }),
+ ],
});
```

> [!TIP]
>
> You can take a look at all the [possible configuration options below](#configuration-options).

# Using `@fujocoded/authproto`

Add the `<Login />` component to your site, like this:

```jsx
// src/pages/index.astro
---
import { Login } from "@fujocoded/authproto/components";
---

<Login />
```

> [!TIP]
> 
> You might run into a naming collision issue if you also have a page named `login`. You can fix this by replacing `{ Login }` with `{ Login as LoginComponent }`.

It'll look like a plain form:

<!-- screenshot -->

To make a page only visible to logged in users:

```jsx
// src/pages/secret.astro
---
const loggedInUser = Astro.locals.loggedInUser;

// if they're not logged in, send them back to a login page
if (!loggedInUser) {
  return Astro.redirect("/login");
}
---

<h1>Secret</h1>
<p>This is a secret page that only authenticated users can see!</p>
```

<!-- screenshots here -->

... And you've got authentication working on your Astro site!

# Okay how do I _actually_ do stuff with this?

Check out the example sites included under the [examples folder](./__examples__/).

# Configuration options

- `applicationName`, required. The name of your application. For example, you
  can set this to `"My personal guestbook"`!
- `applicationDomain`, required. It should be a domain that your site is on, or
  you can just put in `"localhost:4321"` for now.
- `defaultDevUser`, optional. The default handle that gets filled out in the
  `<Login />` component during development.
- `driver`, optional. The driver used to store data about OAuth sessions. This
  takes Astro's [session driver options](https://docs.astro.build/en/reference/configuration-reference/#sessiondriver).
  You can also set this with `name: "astro:db"` to utilize [Astro's DB
  integration](https://docs.astro.build/en/guides/integrations-guide/db/) for
  OAuth sessions. This will set up tables for sessions in your database.
  - NOTE: The default driver is `memory`. This is fine for development, but it's
    recommended that you switch to a more reliable solution for production.
- `scopes`, optional. By default, only the `"atproto"` scope is added. This
  scope is included with any other scope that's enabled. See [ATproto's
  documentation for OAuth
  scopes](https://atproto.com/specs/oauth#authorization-scopes).
  - `email`: boolean, optional. Only used to identify you by email. Does nothing
    to a PDS.
  - `genericData`: boolean, optional. Allows you to read/write data to a user's
    PDS, but does not access BlueSky direct messages.
  - `directMessages`: boolean, optional. Allows you to access BlueSky direct
    messages for a user's account. Requires `genericData` to be enabled.
  - `additionalScopes`: array, optional. This is used in case you need to expand
    permissions to include other services. This should be an array of strings,
    like this: `["scope1", "scope2"]`

# Support Us

You can check out more of our plugins here:

- [Socials
  plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/zod-transform-socials)
- [Alt text files
  plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/remark-alt-text-files)

You can also become a patron or buy some merch:

- [Monthly Support](https://fujocoded.com/support)
- [Merch Shop](https://store.fujocoded.com/)
- [RobinBoob](https://www.robinboob.com/)

# Follow Us

<p align="center"><a href="https://twitter.com/fujoc0ded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/twitter.svg" /></a><a href="https://www.tumblr.com/fujocoded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/tumblr.svg" /></a><a href="https://bsky.app/profile/fujocoded.bsky.social"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/bluesky.svg" /></a><a href="https://blorbo.social/@fujocoded"><img width="35"  src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/mastodon.svg" /></a><a href="https://fujocoded.dreamwidth.org/"><img width="17" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/dreamwidth.svg" /></a></p>
