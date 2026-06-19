# `@fujocoded/astro-smooth-actions`

## What is `@fujocoded/astro-smooth-actions`?

An Astro integration that keeps your form Actions nice and smooth, even when the
visitor has no client-side JavaScript. You install it, your visitor submits a
form, and they land back on a clean page. No `Confirm Form Resubmission` prompt
on refresh, no leftover action query string cluttering the URL, and the action
result still shows up right where you expect it.

## What's included in `@fujocoded/astro-smooth-actions`?

- `astroSmoothActions()` => the integration you register in `astro.config.mjs`.
  It routes every form action through a POST/Redirect/GET cycle, so the visitor
  ends up on a clean page
- `getActionInput()` => reads back the form fields behind the last action
  result, so you can show the visitor exactly what they submitted

## Wait…what's wrong with plain forms?

A plain HTML form sends your data straight to the server:

```astro
<form method="POST" action={actions.subscribe}>...</form>
```

There, the server runs the action and renders the page in the same response.
Then it sends your visitor on their way and back to a page that came from a form
submission.

Now two things can go wrong:

- Refresh, and the browser asks them to `Confirm Form Resubmission` (because
  reloading re-sends the request and re-runs the action)
- The address bar still shows the action's query string, so the URL is not clean
  to bookmark or share, and a refresh can retrigger things like notifications

**The fix is an old web pattern called POST/Redirect/GET.** Instead of a page,
your server answers the POST with a redirect. The browser follows it with a fresh
GET, which means the page your visitor sees has no form body behind it. Refresh reloads that page, and the URL stays clean.

One extra problem: the redirect drops the POST body, which means the action
result would normally disappear right along with it. This is (also) where
`@fujocoded/astro-smooth-actions` comes in! It will:

1. Save the result and your submitted fields before the redirect
2. Read them back on the fresh GET

**tl;dr:** write your forms and actions the normal way, and the clean page comes with no
extra work.

## Setup

1. Install the package:

   ```bash
   npm install @fujocoded/astro-smooth-actions
   ```

2. Register the integration:

   ```js
   // astro.config.mjs
   import { defineConfig } from "astro/config";
   import astroSmoothActions from "@fujocoded/astro-smooth-actions";

   export default defineConfig({
     integrations: [astroSmoothActions()],
   });
   ```

3. Make sure session storage is available. The integration stashes each action
   result in Astro's session between the POST and the redirect, so it needs a
   [session driver or an adapter](https://docs.astro.build/en/guides/sessions/).

> [!WARNING]
>
> Without a session driver or adapter, the integration has nowhere to stash
> results, so it cannot smooth anything. It logs a warning when Astro starts and
> your forms fall back to Astro's normal behavior. No crash, but no smoothing.
> The same fallback covers you while running the live site: if a session write
> ever fails, your form actions still run instead of failing hard.

## Okay how do I _actually_ do stuff with this?

The [`__examples__/`](./__examples__/) folder has runnable Astro apps you can
copy from. Each one has an `index` page with success and error messaging, plus a
`special-cases` page covering `ACTION_INPUT_CONTROL`, comma-separated field
lists, and `ACTION_INPUT_NONE`:

- [`astro-7`](./__examples__/astro-7/) => the demo on the latest Astro
- [`astro-6`](./__examples__/astro-6/) and [`astro-5`](./__examples__/astro-5/)
  => the same demo pinned to those Astro versions

## What happens on each submit

> [!NOTE]
>
> This wraps the pattern Astro's own docs describe in ["Advanced: Persist action
> results with a
> session"](https://docs.astro.build/en/guides/actions/#advanced-persist-action-results-with-a-session).
> Astro recommends it for keeping form actions working without client-side
> JavaScript. This package installs that middleware for you, so you do not copy
> it into every project.

Once the integration is registered, every form action flows through its
middleware, which does its work across two sequential requests:

On the form action POST, it:

1. Catches the POST before the page renders
2. Runs the action on the server
3. Stores the serialized result in the session, plus the restorable values and
   hidden-field markers from your form fields
4. Redirects the browser to a clean page, either the action destination path (on
   success) or the page the visitor submitted from (on error)

Then, on the redirected GET, it:

1. Hands the stored result to `Astro.getActionResult()`, so it can be returned
   to you as the action results
2. Exposes the submitted fields through `getActionInput()`
3. Clears the stored result and its cookie, so a refresh does not replay the
   action

At the end of this, the page your visitor sees is a plain page request with no
submission data, which behaves the way we've all come to love and expect.

> [!NOTE]
>
> Each action payload is keyed to a per-session token in a short-lived cookie, so
> one route or visitor cannot read another's stored result.

## Showing the user what they submitted

In addition to making the submission experience smooth, this integration also
keeps the raw form fields that produced the last action result.
`getActionInput()` hands them back so you can repopulate a form after the
redirect drops the POST body. On a page with more than one form, it also tells
you which form's submission produced the current result, so you can show the
error next to the right one:

```astro
---
import { actions } from "astro:actions";
import { getActionInput } from "@fujocoded/astro-smooth-actions";

const result = Astro.getActionResult(actions.deleteEntry);
const input = await getActionInput({
  locals: Astro.locals,
  action: actions.deleteEntry,
});
---

{input?.id === entry.id && result?.error && <p>{result.error.message}</p>}
```

What you get back:

- String fields keep their full submitted value
- A field name that shows up more than once comes back as a string array, in
  submission order, so checkbox groups stay intact
- File inputs come back as `null`, because they cannot be restored from a
  session store
- Common sensitive field names come back as `null` by default, including
  password, passcode, secret, token, API key, PIN, and OTP fields
- The stored input clears after the redirect target reads it once

## Skipping fields

`@fujocoded/astro-smooth-actions` will round-trip your fields back to you, but
some of their values (like passwords) should never come back, let alone get
saved into a session at all.

> [!IMPORTANT]
>
> Stored form values are a UX convenience, not a security boundary. Reach for
> `excludeFields` or `ACTION_INPUT_CONTROL` for any field whose submitted value
> should never be replayed into HTML. Excluded fields still appear in stored
> input as `null`, so consumers can distinguish them from fields that were never
> submitted.

How to exclude fields depends on how you want to exclude them.

### Skipping fields by name

You may hope the middleware could just skip every `<input type="password">`, but
browsers do not send an input's `type` with the form data. Since there's no way
to tell a password field from a plain text one, we do so by name. A built-in
list of sensitive names has its values hidden by default, and you can change
that list project-wide in the config.

The default list is exported as `DEFAULT_EXCLUDED_FIELDS`. Spread it into your
own array to keep the built-ins and add a few more:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astroSmoothActions, {
  DEFAULT_EXCLUDED_FIELDS,
} from "@fujocoded/astro-smooth-actions";

export default defineConfig({
  integrations: [
    astroSmoothActions({
      input: {
        excludeFields: [
          ...DEFAULT_EXCLUDED_FIELDS,
          "backupEmail",
          "inviteCode",
        ],
      },
    }),
  ],
});
```

> [!IMPORTANT]
>
> Setting `excludeFields` replaces the whole default list, it does not add to it.
> Keep it to the empty array (`[]`) to include all fields.

Matching is forgiving about formatting: names are compared after lowercasing and
stripping punctuation, so `backupEmail`, `backup-email`, and `backup_email` all
count as the same field.

### Skipping individual fields in forms

When a field only needs skipping on one form, add the input control right in the
markup:

```astro
---
import { ACTION_INPUT_CONTROL } from "@fujocoded/astro-smooth-actions";
---

<form method="POST" action={actions.updateProfile}>
  <input type="hidden" name={ACTION_INPUT_CONTROL} value="backupEmail" />
  <input name="displayName" />
  <input name="backupEmail" />
  <button>Save</button>
</form>
```

You can repeat the control or pass a comma-separated list:

```html
<input
  type="hidden"
  name="astro-smooth-actions:input"
  value="backupEmail, inviteCode"
/>
```

### Skipping a whole form

To skip storage for a whole form, like a login form where nothing should come
back:

```astro
---
import {
  ACTION_INPUT_CONTROL,
  ACTION_INPUT_NONE,
} from "@fujocoded/astro-smooth-actions";
---

<form method="POST" action={actions.login}>
  <input type="hidden" name={ACTION_INPUT_CONTROL} value={ACTION_INPUT_NONE} />
  <input name="email" />
  <input name="password" type="password" />
  <button>Log in</button>
</form>
```

The exported `ACTION_INPUT_NONE` sentinel disables input storage for the whole
form. Any other value on the same control is treated as one or more field names
to omit.

### Skipping a whole action

To disable input storage for a whole action, configure the integration with the
action name Astro exposes to middleware:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astroSmoothActions from "@fujocoded/astro-smooth-actions";

export default defineConfig({
  integrations: [
    astroSmoothActions({
      input: {
        excludeActions: ["actions.login"],
      },
    }),
  ],
});
```
