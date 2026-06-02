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
  - Adds the Astro routes you need to authenticate with ATproto
  - Gives you easy access the DID and handle of a logged in user, if any
- `@fujocoded/authproto/components`, which includes:
  - A basic login/logout component to help you get started quickly
  - An authorization component for asking logged-in users for more permissions
- `@fujocoded/authproto/helpers`, which lets you access:
  - `getLoggedInAgent` returns an authenticated agent for the logged in user,
    routing requests through their PDS.
  - `getPdsAgent` returns an agent pointed at any user's PDS. Pass a handle/DID to
    read records, or a logged in user to create, update, or delete them. When
    given a logged in user, it behaves exactly like `getLoggedInAgent`.
  - `getBlueskyAgent` returns an agent for the Bluesky appview (public by
    default, or authenticated if a logged in user is passed).

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
- [ATmosphereConf 2026 Website](https://atmosphereconf.org/) ([repo](https://github.com/ATProtocol-Community/atmosphereconf))

# Getting started

## Pre-requisites

- Node
- NPM/pnpm/yarn
- Terminal
- [Server adapter](https://docs.astro.build/en/guides/on-demand-rendering/#server-adapters) to set up sessions
- (Optional) [session driver](https://docs.astro.build/en/reference/configuration-reference/#sessiondriver) to allow users to log in or log out

> [!IMPORTANT]
>
> `deno` requires a workaround due to a CJS/ESM import issue within
> `@atproto/oauth-client-node`. For now, avoid using `deno` and use other package managers.

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
> You can take a look at [all the settings you can tweak below](#configuring-authproto).

### Manual Installation

1. Run the following command:

```bash
npm add @fujocoded/authproto
```

2. Add the integration to your `astro.config.mjs` file, like this:

```js
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import authproto from "@fujocoded/authproto";

export default defineConfig({
  output: "server", // auth state is only available on dynamically rendered pages
  adapter: node({ mode: "standalone" }), // ... or whichever adapter you're using!
  // ATproto requires the server to be on a "loopback" address instead of
  // simple localhost. If you don't know what this means,
  // don't worry about it! Just set `host: true` :)
  host: true,
  integrations: [
    authproto({
      // The name of your app, shown on the login screen.
      applicationName: "My super cool guestbook",
      // The URL your site is (or will be) available at.
      // Ignored during development.
      applicationDomain: "https:// my-guestbook.fujocoded.com",
    }),
  ],
});
```

This configuration is enough to develop your authenticated
website on your machine. Before putting your site online,
see [Shipping it](#shipping-it-going-to-production-that-is) for things to
pay attention to.

> [!TIP]
>
> You can take a look at [all the settings you can tweak below](#configuring-authproto).

# Using `@fujocoded/authproto`

## Add your login form

Add the `<Login />` component to your site, like this:

```jsx
// src/pages/index.astro
---
import { Login } from "@fujocoded/authproto/components";
---

<Login />
```

It'll look like a plain form:

<!-- screenshot -->

See [Customizing login and authorization forms](#customizing-login-and-authorization-forms) for ways to change how it looks and where it sends people after they log in.

## Make a page only visible to logged in users

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

> [!TIP]
>
> If you also have a page file named `login.astro`, you'll see the TypeScript error `Import declaration conflicts with local declaration of 'Login'` on the import line. Fix it by renaming the import:
>
> ```js
> import { Login as LoginComponent } from "@fujocoded/authproto/components";
> ```

# Okay how do I _actually_ do stuff with this?

Check out the example sites included under the [examples folder](./__examples__/).
When `<Login />` is _Not Enough™_ (a custom checkbox list, a reauthorization
screen, full control over the markup), start from
[`06-custom-scopes`](./__examples__/06-custom-scopes/).

# Configuring authproto

These settings go inside the `authproto({ ... })` call in your
`astro.config.mjs`.

- `applicationName`, required. The name of your application. For example, you
  can set this to `"My personal guestbook"`!
- `applicationDomain`, required. The full URL where your site is (or will be)
  available in production, including the scheme. For example:
  `"https://example.com"`.
- `defaultDevUser`, optional. A handle that gets pre-filled into the
  [login form](#customizing-login-and-authorization-forms) while you're
  developing your site locally (never in production). Saves you from re-typing
  your handle every time you restart the dev server.
- `driver`, optional. The driver used to store data about OAuth sessions. This
  takes Astro's [session driver options](https://docs.astro.build/en/reference/configuration-reference/#sessiondriver).
  You can also set this with `name: "astro:db"` to utilize [Astro's DB
  integration](https://docs.astro.build/en/guides/integrations-guide/db/) for
  OAuth sessions. This will set up tables for sessions in your database.
- `scopes`, optional. The most any login may ever request. Defaults to just
  `"atproto"`. See [Choosing which scopes to
  request](#choosing-which-scopes-to-request).
- `defaultScopes`, optional. What a login asks for when nothing overrides it.
  Defaults to all of your configured `scopes`. See [Choosing which scopes to
  request](#choosing-which-scopes-to-request).
- `resolveScopesEntrypoint`, optional. Path to a module that adjusts the final
  scope list per account. See [Per-account scopes with
  `resolveScopesEntrypoint`](#per-account-scopes-with-resolvescopesentrypoint).
- `redirects`, optional. Where to send users after login and logout, as
  `{ afterLogin, afterLogout }`. Since 0.4.0, both default to sending users back to
  the page they came from. The URLs support template variables like `{referer}`
  and `{loggedInUser.did}`. You can override these per form using a `redirect`
  prop on `<Login />` / `<Authorize />`. See
  [`05-redirects`](./__examples__/05-redirects/) for a full example.
- `externalDomain` (advanced), optional. The public URL Authproto advertises
  to a user's PDS in its OAuth client metadata. Defaults to `applicationDomain`
  in production (and a loopback address during development). You only need to
  set it when the URL a PDS must reach differs from `applicationDomain`, usually
  when using a dev tunnel, a reverse proxy, or a separate auth subdomain. Can
  also be set with the `AUTHPROTO_EXTERNAL_DOMAIN` environment variable, which
  takes precedence.

> [!NOTE]
>
> The default `driver` is `memory`. That's fine for development, but switch to a
> more reliable store for production. See [Storing authentication
> data](#storing-authentication-data).

## Choosing which scopes to request

Scopes control the permissions your app asks a user's PDS to grant. They're
controlled by two options, both optional:

- `scopes`, optional. The most any login may ever request. No form, built-in or
  custom, can ask for a scope outside this set. Defaults to just `"atproto"`,
  which is always included alongside any other scope. See [ATproto's
  documentation for OAuth
  scopes](https://atproto.com/specs/oauth#authorization-scopes).
- `defaultScopes`, optional. What a login asks for when nothing overrides it: no
  `scopes` or `extendDefaultScopes` on `<Login />`, no `scope` fields on a
  custom form. Defaults to all of your configured `scopes`, so set it to a
  narrower list when default forms should ask for less than the maximum.

The `scopes` option takes these flags:

- `email`: boolean, optional. Only used to identify users by email.
- `genericData`: boolean, optional. Allows you to read/write ANY data to a user's
  PDS, but does not access BlueSky direct messages. Prefer granular permissions
  whenever possible: it protects users (and you) from any accidental oopsie.
- `directMessages`: boolean, optional. Allows you to access BlueSky direct
  messages for a user's account. Requires `genericData` to be enabled.
- `additionalScopes`: array, optional. This is used in case you need to expand
  permissions to include other services. This should be an array of strings,
  like this: `["scope1", "scope2"]`

### Granular permissions with the scope helpers

For finer-grained ATproto permissions, use Authproto's scope helpers instead of
hand-writing the strings:

```ts
import authproto, {
  blob,
  permissionScopes,
  repo,
  rpc,
} from "@fujocoded/authproto";

export default defineConfig({
  integrations: [
    authproto({
      applicationName: "My Super Cool ATfujo App",
      applicationDomain: "https://fujocoded.test",
      scopes: {
        additionalScopes: permissionScopes([
          // Create, update, and delete the user's post and like records
          repo(["test.fujocoded.post", "test.fujocoded.like"]),
          // Only delete test.fujocoded.like records
          repo("test.fujocoded.like", { action: "delete" }),
          // Call the getFeed method on your appview service
          rpc("test.fujocoded.getFeed", {
            aud: "did:web:api.fujocoded.test#fun_appview",
          }),
          // Upload image and video files to the user's PDS
          blob(["image/*", "video/*"]),
        ]),
      },
    }),
  ],
});
```

### Per-account scopes with `resolveScopesEntrypoint`

`resolveScopesEntrypoint` (optional) lets you change the final scope list based
on your own custom logic, for example based on which account is requesting log
in. Point it at a `.js/ts` file in your project that exports a
`resolveScopes(input)` function, and Authproto will call it before your final
auth request is sent to the PDS.

`input` is a read-only object with the account's id and three scope lists:

- `input.atprotoId`: the account logging in, as typed into the form. Exactly
  one of `input.atprotoId.handle` / `input.atprotoId.did` is set (whichever the
  user entered); the other is `undefined`, so you can tell which you got.
  Because the same account can log in as either, call
  `await input.atprotoId.resolve()` to get its canonical `{ did, handle }` when
  you need to gate reliably. Just remember: this requires a network roundtrip!
- `input.proposedScopes`: the scopes about to be requested, already narrowed to
  ones you configured. `"atproto"` is always present.
- `input.allowedScopes`: every scope your `scopes` config allows.
- `input.defaultScopes`: your configured `defaultScopes`.

Your function should then return one of:

- A scope array, to replace what gets requested.
- Nothing (or `null`), to accept `input.proposedScopes` unchanged.

Either way, Authproto will only keep scopes you configured and always keeps
`"atproto"`, so your function can never grant access beyond your `scopes`
config.

```ts
import type { ResolveScopesHook } from "@fujocoded/authproto";

export const resolveScopes: ResolveScopesHook = async ({
  atprotoId,
  proposedScopes,
}) => {
  // Resolve to a canonical DID if needed so the check holds whether
  // the user typed their handle or their DID.
  const { did } = atprotoId.did ? atprotoId : await atprotoId.resolve();
  if (did === "did:plc:b0b474n") {
    return [...proposedScopes, "transition:email"];
  }
};
```

# Customizing login and authorization forms

## The `<Login />` form

You can change how `<Login />` looks and behaves by passing it these options:

- `redirect`, optional. Where to send the user after they successfully log in
  or log out.
- `placeholder`, optional. The hint text shown inside the input when it's
  empty.
- `scopes`, optional. Exact scopes to request from this form. Authproto keeps
  only scopes from your integration's `scopes` config and always keeps
  `"atproto"`. Defaults to your configured `defaultScopes` when omitted.
- `extendDefaultScopes`, optional. Extra scopes to request on top of the
  configured `defaultScopes`, NOT on top of the current session's grant.
  Authproto keeps only configured scopes here too. To extend the current
  session's grant instead, see [How `scopes` and `extendDefaultScopes`
  work](#how-scopes-and-extenddefaultscopes-work) for a full example.
- Any standard HTML `<form>` attribute: `class`, `class:list`, `id`,
  `aria-*`, `data-*`, `style`, and so on. These get applied directly to the
  form, so you can style it, label it for screen readers, or use any field
  other libraries may require.

> [!NOTE]
>
> `action` and `method` are set by the component. They're what makes login and
> logout work, so they can't be changed.

> [!TIP]
>
> During development, you can pre-fill the input with a default handle by
> setting [`defaultDevUser`](#configuring-authproto) in your `astro.config.mjs`.

```jsx
<Login
  class="my-login-form"
  aria-label="Sign in with your Atmosphere account"
  redirect="/dashboard"
  placeholder="you.bsky.social"
/>
```

## Asking for more permissions with `<Authorize />`

Use `<Authorize />` when a user may already be logged in and you want to ask for
more permissions.

- When the user is logged out `<Authorize />` behaves the same as `<Login />`.
- When the user is authenticated, `<Authorize />` will wrap its slot in a button
  and start a new authorization flow when clicked.
- When the user is authenticated and already has every requested scope,
  `<Authorize />` renders its `authorized` slot instead.

```astro
---
import { Authorize, Login } from "@fujocoded/authproto/components";
import { blob, repo } from "@fujocoded/authproto";
---

<Login />

<Authorize
  extendDefaultScopes={[
    repo("app.example.post", { action: ["create", "update"] }),
    blob("image/*"),
  ]}
  redirect="/compose"
>
  Click to enable posting
  <span slot="authorized">Posting is already enabled</span>
</Authorize>
```

`<Authorize />` supports the same `redirect`, `placeholder`, `scopes`,
`extendDefaultScopes`, and form attribute props as `<Login />`.

> [!TIP]
>
> After any OAuth returns (including from `<Authorize />`), Authproto stores the
> scopes from that latest flow as the local session grant; it won't merge
> them with the ones previously granted.

## How `scopes` and `extendDefaultScopes` work

`<Login />` and `<Authorize />` take the same scope props. What a form
requests depends on which you set:

- No `scopes` or `extendDefaultScopes`: request `defaultScopes`.
- `scopes`: request this exact set, with `"atproto"` added automatically.
  Can be used with `Astro.locals.loggedInUser?.scopes` to extend current
  scopes.
- `extendDefaultScopes`: request `defaultScopes` plus these extras. Extends your
  configured `defaultScopes`, not the user's current scopes.

```astro
---
import { repo } from "@fujocoded/authproto";

const currentScopes = Astro.locals.loggedInUser?.scopes ?? [];
const currentScopesPlusPost = [
  ...new Set([
    ...currentScopes,
    repo("test.fujocoded.post", { action: ["create", "update"] }),
  ]),
];
---

<Authorize scopes={currentScopesPlusPost} redirect="/compose">
  Click here to enable posting
  <span slot="authorized">Posting is enabled</span>
</Authorize>
```

## Building your own form

When `<Login />` or `<Authorize />` are _Not Enough™_, you can roll your own
HTML form that—just like them!—posts to `/oauth/login`.

The `/oauth/login` route supports these form inputs:

- `atproto-id`, required. The handle or DID to log in.
- `redirect`, optional. The URL or path to send the user to after login.
- `scope`, optional and repeatable. Unsupported scopes are ignored: each value
  is kept only when it is in your configured Authproto `scopes`. If the form
  does not send any `scope` fields, Authproto uses `defaultScopes`. If the form
  sends scope fields, you'll need to send every scope you want to keep in the
  resulting local grant.

To build the form's choices from the scopes you configured, you can import them
from `fujocoded:authproto/config` module instead of typing scope strings into
the page by hand. Your form will automatically update whenever you change
`authproto({ scopes })`.

The most useful exports for custom forms are:

- `defaultDevUser`
- `scopes`
- `defaultScopes`

See [`06-custom-scopes`](./__examples__/06-custom-scopes/) for a full example.

# Shipping it (going to production, that is)

Before putting your site online, there are a few things to make sure of:

1. **Your site uses [on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/).**
   Authproto needs `output: "server"` and a server adapter (like
   `@astrojs/node`) so login state can be read on every request.
2. **You've set up durable session storage** for both Astro's `session.driver`
   and Authproto's `driver`. See [Storing authentication data](#storing-authentication-data)
   and below for the options.

Both default to in-memory storage, which means everything they hold lives
only in your server's RAM. Restarting or redeploying your site wipes it
and logs everyone out. That's fine for local dev, and you can keep it in
production too if you don't mind your visitors having to log back in every
time you ship.

## Storing authentication data

By default, Astro's `session.driver` and Authproto's `driver` store their data
in memory, which is wiped whenever your site is restarted, logging everyone out.

This is ok for development...and for production if you don't mind your users
being forced to log back in every time you ship a new version.

### With Astro DB

The simplest durable setup uses [Astro's DB integration](https://docs.astro.build/en/guides/integrations-guide/db/)
for both Astro's session and Authproto's store:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import db from "@astrojs/db";
import authproto from "@fujocoded/authproto";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  session: {
    driver: "db",
  },
  integrations: [
    db(),
    authproto({
      applicationName: "My super cool guestbook",
      applicationDomain: "https:// my-guestbook.fujocoded.com",
      driver: { name: "astro:db" },
    }),
  ],
});
```

> [!TIP]
>
> If you don't already have somewhere to host the database, [Turso](https://turso.tech/)
> is the host Astro DB recommends, and it has a free tier you can start with.

### Without a database

If you can't run a classic database, you can:

- pick a different driver from
  [Astro's session driver list](https://docs.astro.build/en/reference/configuration-reference/#sessiondriver).
  On serverless or edge hosting, options like Redis, Upstash, or Cloudflare
  KV all work. Set the same kind of driver on both `session.driver` and
  Authproto's `driver`.

You can also leave both on the default `memory` driver if you're OK with
visitors having to log back in every time the server restarts. Nothing
else changes.

### With a file on disk

A file-based driver (like `fs`) writes Authproto's store directly to disk.
The file holds everything Authproto needs to keep your visitors logged in,
so treat it like a credentials file:

- Set `options.base` to a path you control (don't rely on the driver's
  default location)
- Add that path to your `.gitignore`
- Make sure only the server can read it on the host

At startup, Authproto runs `git check-ignore` against your `base` path and
warns if it isn't covered by `.gitignore`, so you'll hear about it before
you commit anything.

## If something may have gone wrong

If you believe something that shouldn't be exposed has been exposed, or you just want to
invalidate every active session, you should clear out Authproto's store:

- **Astro DB:** drop all rows in the table Authproto created.
- **KV / Redis / file driver / etc.:** delete the keys (or file) Authproto
  wrote. Each driver's docs cover how.
- **Memory store:** close the app.

Once the store is empty, anyone who was signed in goes back through the
regular login flow the next time they visit.

> [!NOTE]
>
> You may see a warning about a missing "lock mechanism" in your logs.
> You can ignore it unless you're running multiple server instances. If
> you are, you'll know how to handle it.

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
