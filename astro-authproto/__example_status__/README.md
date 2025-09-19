# How to use `@fujocoded/authproto` in practice!

To actually make data show up on BlueSky or atproto, you'll need to do this:

1. Install `@atproto/api`.

```bash
npm install @atproto/api
```

> [!NOTE]
> You'll need to set your OAuth scopes accordingly. `genericData` should be set to true under the `scopes` configuration option.

2. You'll also need to create an agent, which will essentially interact with atproto for you. Most of the needed atproto libraries should already be included with the integration.

See `src/lib/atproto.ts` for more info.

3. Using [Astro's Actions API](https://docs.astro.build/en/guides/actions/), you'll build up code to make requests to atproto. Make an `actions` folder inside `src` if you haven't already. From here, we'll create a server.

```typescript
// src/actions/index.ts
import { getAgent } from "../lib/atproto";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:content";

export const server = {
  // start here!
}
```

For this example, we'll do a status update. You can write text and then display them on your PDS.

See `src/actions/index.ts` for the code.

4. To actually see if this works, let's make a form. You can see how this is done in `src/pages/status.astro`. (It also has an example of how to display all the statuses made by the logged in user. Great for a semi-private diary!)

Make sure that your form field uses `name` that matches the "schema" defined earlier in the action. In our example, it should be `<input type="text" name="status" />`.

Then hit post to see if it shows up. You can use [PDSls](https://pdsls.dev/) to test it out! Search by the handle you used to log in.