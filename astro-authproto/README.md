@fujocoded/authproto

<!-- banner -->

ATproto authentication for your Astro site. For free:tm:!

<!-- badges -->

# What does @fujocoded/authproto do?

`@fujocoded/authproto` allows your visitors to log into your website through
ATproto services (like BlueSky). Under the hood, `@fujocoded/authproto` uses
`@atproto/oauth-client-node` to add OAuth authentication using Astro's session
adapters to store your visitor's credentials.

<!-- screenshot of oauth x'd out -->
<!-- screenshot of fujocoded thumbsup -->

## What's included

In this package, you'll find:

- An Astro integration that adds the authentication routes you need
- A way to know if a user is logged in and retrieve their DID and handle
- A basic login/logout component to get you started quickly

# What can you do with it?

- You can check to see if someone has an account on ATproto (such as an account
  on BlueSky). With this, you can:
  - Build private, friends-only spaces
  - Gate certain content from the public
- You can read data from other ATproto services, like
  [BlueSky](https://bsky.app/), [Streamplace](https://stream.place/),
  [Teal.FM](https://teal.fm/), and more! Some examples:
  - Embed BlueSky posts or [Leaflet publications](https://leaflet.pub/)
  - List your stats from [RockSky](https://rocksky.app/)
- You can create, update, and delete data from your account on ATproto.
  - Build [guestbooks](https://github.com/FujoWebDev/lexicon-guestbook/) that
    others on ATproto can interact with
  - Make your _own_ ATproto app

<!-- replace this with a fancier display -->

## Examples

- [Guestbook lexicons](https://github.com/FujoWebDev/lexicon-guestbook/)
- [Fanfic archive](https://github.com/haetae-bit/fanfic-atproto)

# How to start

## Pre-requisites

- Node
- NPM/pnpm/yarn
- Terminal

> [!IMPORTANT] `deno` requires a workaround due to a CJS/ESM import issue within
> `@atproto/oauth-client-node`.

// TODO: we can move this in a details tab

Requires some familiarity with Astro, but if you want to jump in head first:

1. Install Astro by [following their official
   tutorial](https://docs.astro.build/en/install-and-setup/#install-from-the-cli-wizard).
   Once you do, [set your Astro site to server
   mode](https://docs.astro.build/en/guides/on-demand-rendering/#server-mode).
2. Install [any of the
   adapters](https://docs.astro.build/en/guides/on-demand-rendering/#server-adapters).

- You can start out with
  [Node](https://docs.astro.build/en/guides/integrations-guide/node/), since
  that's a widely supported runtime.

3. Run the following command:

```bash
npm install @fujocoded/authproto
```

```bash
npx astro add @fujocoded/authproto
```

4. Add the integration to your `astro.config.mjs` file, like this:

// TODO: add a note that this requires a server and an adapter that supports
// some type of storage...? I'm unsure how it works on e.g. netlify for the
// various session handlers

// TODO: we might also want to make sure people do not set certain adapters
// or even better just disallow the ones they shouldn't.

```typescript
import { defineConfig } from "astro/config";
+ import node from "@astrojs/node";
+ import authproto from "@fujocoded/authproto";

export default defineConfig({
  output: "server",
+ adapter: node({ mode: "standalone" }), // ... or whichever adapter you're using!
+ integrations: [
+   authproto({
+     // config options here
+   }),
+ ],
});
```

> [!TIP] You can take a look at all the [possible configuration options
> below](#configuration-options).

5. Add the `<Login />` component to your site, like this:

```
// src/pages/index.astro
---
import { Login } from "@fujocoded/authproto/components";
---

<Login />
```

> [!TIP] You might run into a naming collision issue if you also have a page
> named `login`. You can fix this by replacing `{ Login }` with `{ Login as
LoginComponent }`.

It'll look like a plain form:

<!-- screenshot -->

To make a page only visible to logged in users:

```
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

Check out the example sites included:

- [`__example__`](./__example__) shows you how to set up a login flow.
- `__example_status__` has some examples of creating new records on a PDS.

# Configuration options

- `applicationName`, required. The name of your application. For example, you
  can set this to `"My personal guestbook"`!
- `applicationDomain`, required. It should be a domain that your site is on, or
  you can just put in `"localhost:4321"` for now.
- `defaultDevUser`, optional. The default handle that gets filled out in the
  `<Login />` component during development.
- `driver`, optional. The driver used to store data about OAuth sessions. This
  takes Astro's [session driver
  options](https://docs.astro.build/en/reference/configuration-reference/#sessiondriver).
  You can also set this with `name: "astro:db"` to utilize [Astro's DB
  integration](https://docs.astro.build/en/guides/integrations-guide/db/) for
  OAuth sessions. This will set up tables for sessions in your database.
  - NOTE: The default driver is `memory`. This is fine for development, but it's
    recommended that you switch to a more reliable solution for production.
  - NOTE: Using either `localStorage` or `sessionStorage` will result in a
    ["Session storage could not be initialized."
    error](https://docs.astro.build/en/reference/errors/session-storage-init-error/)
    (and is considered insecure for handling sessions anyway). Consider other
    options, like a database.
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
