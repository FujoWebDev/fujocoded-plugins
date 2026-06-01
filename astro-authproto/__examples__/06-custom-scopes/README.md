# Custom login forms with `@fujocoded/authproto`

`<Login />` covers the common path. This example covers what to do when that
path is _Not Enough™_: pick exactly the scopes you want, render your own
checkbox list, or send a logged-in user back through login to change their
grant.

## Tweaking scopes without leaving `<Login />`

For small per-form changes, keep using `<Login />`:

- Pass nothing to request your configured `defaultScopes`
- Pass `scopes` to request exactly those (`atproto` is always added)
- Pass `extendDefaultScopes` to add extras on top of your defaults, not on top
  of the user's current grant

`<Authorize />` uses the same scope prop meanings as `<Login />`; it just sends
an already logged-in user's DID for you and skips rendering when the current
session already has the requested grant.

```astro
---
import { account } from "@fujocoded/authproto";
---

<!-- Just atproto, nothing else -->
<Login scopes={[]} />

<!-- Your default scopes, plus read access to the user's email -->
<Login extendDefaultScopes={[account("email")]} />
```

## Not Enough™? Use the advanced custom form path

For full control over the markup, build an HTML form that posts directly to
`/oauth/login`. This is the supported path for custom Authproto forms.
Don't worry: it is still a normal HTML form.

The route supports these fields:

- `atproto-id`, required. The handle or DID to log in.
- `redirect`, optional. The URL or path to send the user to after login.
- `scope`, optional and repeatable. Each value is kept only when it is in your
  configured Authproto `scopes`. Unsupported scopes are ignored. If the form
  does not send any `scope` fields, Authproto uses `defaultScopes`. If the form
  sends scope fields, send every scope you want to keep in the resulting local
  grant.

Each checkbox sends one `scope` value, which has to match a scope from your
config exactly:

```html
<form action="/oauth/login" method="post">
  <input name="atproto-id" placeholder="bobatan.fujocoded.dev" />
  <label
    ><input type="checkbox" name="scope" value="account:email" /> Email</label
  >
  <label
    ><input
      type="checkbox"
      name="scope"
      value="repo:com.fujocoded.guestbook?action=create&action=update"
    />
    Guestbook</label
  >
  <button type="submit">Login</button>
</form>
```

Rather than copy those strings by hand, the example page imports
`defaultDevUser` and `scopes` from the `fujocoded:authproto/config` virtual
module. The checkbox list then always matches the scopes you configured.

## Granting more (or fewer) scopes after first login

A user is already logged in but wants different permissions? Post any custom
form to `/oauth/login` with their DID and the new scope checkboxes. Authproto
will authenticate the user again and replace the stored scopes when they come
back. That means the form should send the complete grant you want after the
flow, not only the scopes you want to add.

This example pre-checks boxes with `Astro.locals.loggedInUser.scopes` for that
reason: keeping a checked box means "keep this scope in the next grant."

## Checking what scopes a user actually has

To know what scopes a user has, read `Astro.locals.loggedInUser.scopes`. This
is the list the PDS actually granted.

Be careful: it may be narrower than what you asked for!

## Configuration

Custom forms are still limited to the maximum scopes you declared in your
config. Authproto keeps custom `scope` fields only when they are in configured
Authproto scopes.

This example builds those scopes with the granular permission helpers Authproto
exports. Each one returns a single scope string, so you ask for exactly the
access you need instead of a broad bucket:

- `account("email")` reads the user's email address and confirmation status
- `repo("com.fujocoded.guestbook", { action: [...] })` creates, updates, or
  deletes records in one collection
- `rpc("chat.bsky.convo.sendMessage", { aud: "..." })` calls one method on one
  service

The other helpers are `blob`, `identity`, and `include`. `permissionScopes`
joins a list together and drops any `false` entries, which is handy when some
scopes are conditional.

This example lists every scope any form might ask for under `scopes`. Then it
uses `defaultScopes` to keep the built-in `<Login />` narrower:

```js
import authProto, { account, repo, rpc } from "@fujocoded/authproto";

authProto({
  // Every scope any form (built-in or custom) is allowed to request
  scopes: [
    account("email"),
    repo("com.fujocoded.guestbook", { action: ["create", "update", "delete"] }),
    rpc("chat.bsky.convo.sendMessage", {
      aud: "did:web:api.bsky.chat#bsky_chat",
    }),
  ],
  // Scopes requested when no form overrides them (`atproto` is always added)
  defaultScopes: [
    repo("com.fujocoded.guestbook", { action: ["create", "update", "delete"] }),
  ],
});
```

If the final request should depend on the account, set `resolveScopesEntrypoint`
to a server module. Authproto calls the hook after it has read the form and
dropped scopes you did not configure. The hook receives frozen readonly scope
arrays and can return nothing to accept the proposed request:

```ts
import { account, type ResolveScopesHook } from "@fujocoded/authproto";

const resolveScopes: ResolveScopesHook = ({ atprotoId, proposedScopes }) => {
  if (atprotoId.handle?.endsWith(".fujocoded.com")) {
    return [...proposedScopes, account("email")];
  }
};

export default resolveScopes;
```
