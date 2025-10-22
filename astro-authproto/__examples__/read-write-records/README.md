# How to use `@fujocoded/authproto` in practice!

## Before you start

1. Other than `@fujocoded/authproto`, you'll also need `@atproto/api` and `@atproto/common-web` to use the code in this example. You can install it with:

```bash
npm install @atproto/api @atproto/common-web
```

> [!NOTE]
> You'll need to set your OAuth scopes accordingly. `genericData` should be set to true under the `scopes` configuration option.

2. You'll also need to create an agent, which will essentially interact with atproto for you. Most of the needed atproto libraries should already be included with the integration. See [`src/lib/atproto.ts`](./src/lib/atproto.ts) for the full code.

[The previous example](../__example__) showed how to log in and log out a user using `@fujocoded/authproto`. This example will show you show to create and list records. This will involve:

- Creating an ATproto agent, which will interact with ATproto on your behalf. After following the [before you start](#before-you-start) section, you can check out (or copy) [`src/lib/atproto.ts`](./src/lib/atproto.ts) to see how to create the agent.
- Use the ATproto agent to [list records from a collection](./src/components/Status.astro).
- Pairing the ATproto agent with Astro actions to [create new records in a collections](./src/actions/index.ts).

> [!NOTE]
> To create, update, and delete records in your PDS, you'll need to set your OAuth scopes accordingly. `genericData` should be set to true under the `scopes` configuration option.

## In this example

For this example, we'll do a status update. You can write text and then display them on your PDS.

![A simple form with a textbox that says 'happy! ^^'](./assets/form.png)

You can use [PDSls](https://pdsls.dev/) to test it out! Search by the handle you used to log in.
For this example, we'll do a status update. You can write text and then display them on your PDS. See [`src/actions/index.ts`](./src/actions/index.ts) for the code.

4. To actually see if this works, let's make a form. You can see how this is done in [`src/pages/status.astro`](./src/pages/status.astro). (It also has an example of how to display all the statuses made by the logged in user. Great for a semi-private diary!)

![A screenshot of the PDSls service where a record for 'xyz.statuscity.status' has been made](./assets/result.png)

![A screenshot of the resulting statuses show up on the Astro demo website](./assets/display_result.png)

5. Then hit post to see if it shows up. You can use [PDSls](https://pdsls.dev/) to test it out! Search by the handle you used to log in.
