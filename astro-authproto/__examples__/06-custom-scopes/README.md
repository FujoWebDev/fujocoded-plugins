# How to use custom scopes with `@fujocoded/authproto`

By default, your app requests all the scopes you've configured. But sometimes
you want to ask for different permissions depending on the situation!

## Controlling scopes from the `<Login />` component

Pass `scopes` to request exactly those (ignoring defaults — `atproto` is always
included), or `additionalScopes` to tack extras onto your defaults:

```jsx
<!-- Just atproto, nothing else -->
<Login scopes={[]} />

<!-- Your default scopes + DMs -->
<Login additionalScopes={["transition:chat.bsky"]} />
```

## Custom checkbox forms

Want even more control? Build your own form with checkboxes that post directly
to `/oauth/login`:

```html
<form action="/oauth/login" method="post">
  <input name="atproto-id" placeholder="handle.bsky.social" />
  <label><input type="checkbox" name="scope" value="transition:email" /> Email</label>
  <label><input type="checkbox" name="scope" value="transition:generic" /> Read/write data</label>
  <label><input type="checkbox" name="scope" value="transition:chat.bsky" /> DMs</label>
  <button type="submit">Login</button>
</form>
```

## Re-authenticating with different scopes

Already logged in but want to change permissions? Post to `/oauth/login` again
with the user's DID and new scope checkboxes — it'll start a fresh OAuth flow
and update the session with the new scopes.

## Checking granted scopes

Once logged in, you can see what scopes a user has with
`Astro.locals.loggedInUser.scopes`.

## Configuration

This example uses `defaultScopes` to request only a subset of the configured
max scopes by default:

```js
authProto({
  // Max allowed scopes
  scopes: { email: true, genericData: true, directMessages: true },
  // Only request these by default
  defaultScopes: ["atproto", "transition:generic"],
})
```
