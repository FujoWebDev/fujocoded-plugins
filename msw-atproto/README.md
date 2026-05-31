# `@fujocoded/msw-atproto`

<!-- banner -->

[MSW](https://mswjs.io/) request handlers for tests that talk to ATproto
services...or at least _believe_ they do.

<!-- badges -->

## What is `@fujocoded/msw-atproto`?

`@fujocoded/msw-atproto` uses the power of [MSW](https://mswjs.io/) to give
you(r tests) fake, <u>stateful</u> ATproto accounts that respond to HTTP
requests exactly like real PDSes on the real network would! Set a DID, a handle,
and the records for each of these accounts, then just let your code read and
write through normal ATproto PDS endpoints: it will do so while staying
completely offline. With `@fujocoded/msw-atproto` your Atproto tests can stay
fast and deterministic, while overrides remain as close as possible to the source
of truth, which makes them easier to reason about.

Thanks to this library, you can (pretend to):

1. Serve DID documents from the PLC directory, the public registry for
   `did:plc:...` accounts
2. Serve `.well-known/atproto-did`, the handle lookup URL your code needs to know
   an account's DID
3. Serve PDS record endpoints like `listRecords`, `getRecord`, `createRecord`,
   `putRecord`, `deleteRecord`, and `applyWrites`
4. Serve PDS blob endpoints for uploads and reads, so records can point at
   image or file data
5. Store successful writes in memory, so a later read sees what the test wrote

> [!IMPORTANT]
>
> This package currently covers PDS record reads/writes, PDS blob reads, and
> identity resolution. It does **not** cover firehose methods like
> `com.atproto.sync.subscribeRepos`, the whole OAuth dance, or AppView
> endpoints, like anything under `app.bsky.*`.

## What can **you** do with `@fujocoded/msw-atproto`?

- **Test code that reads Bluesky posts or custom ATproto records** through a
  real `AtpAgent` or `Client`, including for long lists that need pagination
- **Test code that writes to a PDS**, such as creating a Bluesky post, updating
  a profile, or deleting a record. These persist across requests in the same test.
- **Test records that point at blobs**, such as image refs, sprite sheets, or
  thumbnails, without hosting a real file server
- **Test identity resolution**, including handle lookup, PLC lookup, missing
  DIDs, and handle changes
- **Test PLC document updates**, such as adding a verification method or moving
  an account to a new PDS
- **Test failure modes** like a missing record, a missing blob, a `.well-known`
  404, or one flaky `getRecord` request

## What's included in `@fujocoded/msw-atproto`?

In this package, you'll find:

- `useMockAtprotoRepo()` and `createMockAtprotoRepo()`: Create one fake account
  with identity, record, and blob handlers
- `useMockRepoIdentity()` and `createMockRepoIdentity()`: Create one fake
  identity (without record or blob handlers)
- `useMockPlcOperationFlow()` and `createMockPlcOperationFlow()`: Create the
  fake network calls used when code updates a DID document
- `createDnsMock(importActual)`: Makes handle resolution fall back to the HTTP
  path MSW can intercept (a must-have when using handles in your tests!)
- `createIdentityPassthrough()`: Lets one test mix fake accounts with real
  handles
- `FAKE_CID`: A placeholder CID for when the exact value does not matter
- `fakeCid(input)` and `cidForRecord(...)`: Give you stable CIDs for assertions

## Setup (a.k.a. okay, how do I _actually_ do this stuff?)

1. Run the following command:

```bash
npm add --save-dev @fujocoded/msw-atproto msw
```

2. Create one MSW server for your tests:

```ts
// __tests__/msw/server.ts
import { setupServer } from "msw/node";

export const server = setupServer();
```

3. Start MSW and install the DNS helper in your test setup:

```ts
// __tests__/setup.ts
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./msw/server.ts";

// THIS IS IMPORTANT!
// MAKE SURE YOU HAVE THIS IF YOU NEED TO RESOLVE HANDLES!
vi.mock("node:dns/promises", async (importActual) => {
  const { createDnsMock } = await import("@fujocoded/msw-atproto");
  return createDnsMock(importActual);
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
```

> [!IMPORTANT]
>
> Keep `onUnhandledRequest: "error"` on in your test setup. Missing ATproto
> fakes should fail the test loudly. Without that flag, MSW lets an unmatched
> request through and your test may call the real network.
>
> If your tests still do real HTTP calls, you may need to allow certain requests
> to punch through.

1. Wire the setup file into Vitest:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./__tests__/setup.ts"],
  },
});
```

5. In a test, create a fake account, then just use a real client:

```ts
// __tests__/example.test.ts
import { AtpAgent } from "@atproto/api";
import { expect, test } from "vitest";
import { useMockAtprotoRepo } from "@fujocoded/msw-atproto";

import { server } from "./msw/server.ts";

test("loads records for one account", async () => {
  const repo = useMockAtprotoRepo(server, {
    did: "did:plc:bobatan",
    handle: "bobatan.fujocoded.com",
    records: {
      "app.bsky.feed.post": [
        { rkey: "whatever", value: { text: "hello fujin!" } },
      ],
    },
  });

  // The exact same code as production...
  const agent = new AtpAgent({ service: repo.pds });
  const { data } = await agent.com.atproto.repo.listRecords({
    repo: "did:plc:bobatan",
    collection: "app.bsky.feed.post",
  });

  // ...but our test's own special result!
  expect(data.records).toHaveLength(1);
});
```

> [!NOTE]
>
> By default, `msw-atproto` takes over every ATproto handle in your tests: the
> `createDnsMock` DNS helper makes all `_atproto.<handle>` TXT lookups fail with
> `ENODATA`, to force the ATproto identity library to check
> `https://<handle>/.well-known/atproto-did` instead (which MSW can intercept).
> If your tests need a mix of fake and real handles together, see
> [`identity-passthrough.test.ts`](https://github.com/FujoWebDev/fujocoded-plugins/blob/main/msw-atproto/__tests__/identity-passthrough.test.ts).

## Examples You Can Run (and Copy)

Runnable examples live in
[`__examples__/`](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/msw-atproto/__examples__).

Run them from the repo root:

```sh
npm test --workspace @fujocoded/msw-atproto -- __examples__
```

Pick the file that matches your needs:

- [`01-stateful-repo.test.ts`](https://github.com/FujoWebDev/fujocoded-plugins/blob/main/msw-atproto/__examples__/01-stateful-repo.test.ts):
  one fake Bluesky account, real `AtpAgent` calls, seeded records, writes,
  reads, and blobs
- [`02-repo-boundaries.test.ts`](https://github.com/FujoWebDev/fujocoded-plugins/blob/main/msw-atproto/__examples__/02-repo-boundaries.test.ts):
  empty collections, several accounts on one PDS, identity changes, and
  cursor-based pagination
- [`03-empty-repo-and-raw-msw.test.ts`](https://github.com/FujoWebDev/fujocoded-plugins/blob/main/msw-atproto/__examples__/03-empty-repo-and-raw-msw.test.ts):
  an intentionally empty account, plus raw MSW for server behavior this package
  does not model
- [`04-shared-fixture.test.ts`](https://github.com/FujoWebDev/fujocoded-plugins/blob/main/msw-atproto/__examples__/04-shared-fixture.test.ts):
  one shared setup pattern for a suite where every test starts from the same
  state

## Customize Your Fake Account

### `useMockAtprotoRepo`: faking a PDS

`useMockAtprotoRepo(server, { did, pds?, handle?, records?, blobs? })` creates
one fake account and registers its handlers with the MSW server.

#### Config options

- **`did`** (required): The account DID, like `did:plc:bobatan`. This identifies
  the repo, that is the account's PDS, on every XRPC call
- **`pds`** (optional): The fake PDS URL. Defaults to
  `https://pds.fujocoded.test`. The returned fake exposes the final value as
  `repo.pds`
- **`handle`** (optional): The account handle, like
  `bobatan.fujocoded.com`. When set, the library will also serve
  `https://<handle>/.well-known/atproto-did`. Record reads and writes also
  accept this handle in the XRPC `repo` parameter
- **`records`** (optional): Seed records, grouped by collection NSID, like
  `app.bsky.feed.post`. Each seed record has `{ rkey, value, cid? }`. When `cid`
  is omitted, the library derives a stable CID from the repo DID, collection, rkey,
  and value
- **`blobs`** (optional): Blob bodies the fake PDS can serve from
  `com.atproto.sync.getBlob`. Each seed has `{ cid, body?, contentType? }`

When `records` is omitted, no collections are declared. A `listRecords` request
for an undeclared collection fails the test under `onUnhandledRequest: "error"`.
Seed `[]` when an empty collection is the expected result:

```ts
const repo = useMockAtprotoRepo(server, { did: "did:plc:bobatan" });
repo.seed("app.bsky.feed.post", []);
```

#### `MockAtprotoRepo` properties

- **`pds`**: The URL the handlers answer on
- **`did`** and **`handle`**: The identity values the fake was created with
- **`handlers()`**: The MSW handlers for manual registration. Includes
  identity handlers, all six record endpoints, and both blob endpoints
- **`records()`**: A snapshot of the current stored records
- **`writes()`**: Successful write requests captured so far
- **`deletes()`**: Successful delete requests captured so far
- **`seed(collection, records)`**: Declares a collection and adds or replaces
  records in it. Pass `[]` to declare a collection as intentionally empty
- **`seedBlob(blob)`**: Adds or replaces one hosted blob
- **`clear()`**: Clears records, blobs, declared collections, captured writes,
  captured deletes, queued failures, and generated counters
- **`identity.*`**: One-off identity handlers and mutators for missing PLC
  documents, custom DID documents, handle changes, and verification methods
- **`failOnce.*`**: One-shot ATproto-shaped failure handles for the next matching
  endpoint request

### `useMockRepoIdentity`: faking an identity

Use `useMockRepoIdentity(server, { did, pds?, handle? })` when your test only
needs account identity. It serves the PLC DID document, and (when you pass a
`handle`) serves `.well-known/atproto-did`.

When the test already has a fake account, you can simply use `repo.identity`
from `useMockAtprotoRepo(...)` .

#### `MockRepoIdentity` properties

- **`pds`**: The PDS URL advertised by the fake identity
- **`did`** and **`handle`**: The identity values the fake was created with
- **`handlers()`**: The MSW handlers for manual registration
- **`plcNotFound()`**: Makes PLC lookup return `404 NotFound`
- **`didDocument(doc)`**: Serves a custom DID document
- **`wellKnownNotFound()`**: Makes handle lookup return `404`
- **`handleResolvesTo(otherDid)`**: Makes the configured handle point at another
  DID
- **`setDidDocument(doc)`**: Replaces the stored DID document without
  registering a new MSW handler
- **`updateDidDocument(fn)`**: Updates the stored DID document
- **`setVerificationMethod(name, didKeyOrMultibase)`**: Adds or replaces a DID
  document verification method
- **`setHandleDid(nextDid)`**: Changes the DID returned by the configured handle
- **`reset()`**: Restores the original DID document and handle result

## `useMockPlcOperationFlow`: faking updates to DID documents

Use `useMockPlcOperationFlow(server, { did, pds?, operation, signedOperation?,
onSign?, onSubmit? })` when code asks a PDS to update a DID document.

Use `createMockPlcOperationFlow(...)` when you want the flow fake without
registering it right away. It returns the same object, including `handlers()`.

This covers the three network calls involved in an update to the PLC (the
directory that stores the current DID document for `did:plc:...` accounts).

The flow fake registers three handlers:

- Serves the current PLC operation from the account's audit log
- Serves the PDS signing endpoint and returns `{ operation: signedOperation }`,
  or echoes the submitted body with `signed: true`
- Accepts the signed operation at the PLC directory and returns `{}`

`onSign(body)` and `onSubmit(body)` let your test assert on the payload sent to
each step. `plcDirectoryUrl` defaults to `https://plc.directory`.

## Simulate failures

To return a ATproto-shaped errors, queue a one-shot failure on the fakes:

```ts
repo.failOnce.getRecord({ status: 404 });
```

The next matching `getRecord` request returns:

```json
{ "error": "RecordNotFound", "message": "Record not found" }
```

...then it all goes back to normal.

### More failures!

Each `failOnce.*` method accepts an optional `status`, `error`, and `message`,
plus filters for that endpoint:

- `listRecords` and `createRecord` => `collection`
- `getRecord`, `putRecord`, and `deleteRecord` => `collection` and `rkey`
- `getBlob` => `cid`

For example, fail the next `listRecords` request for one collection:

```ts
repo.failOnce.listRecords({
  collection: "app.bsky.feed.post",
  status: 503,
});
```

Fail the next `getRecord` request for one record:

```ts
repo.failOnce.getRecord({
  collection: "app.bsky.feed.post",
  rkey: "3k2jxqj7m4s2a",
  status: 404,
});
```

Fail the next blob read for one CID:

```ts
repo.failOnce.getBlob({
  cid: avatarCid,
  status: 404,
  message: "Avatar blob is missing",
});
```

To test a network failure or malformed response (or other, pernicious
cases), use raw MSW:

```ts
import { http, HttpResponse } from "msw";

server.use(
  http.get(`${repo.pds}/xrpc/com.atproto.repo.getRecord`, () =>
    HttpResponse.error(),
  ),
);
```

## Faking CIDs

When a seed record has no `cid`, `useMockAtprotoRepo(...)` derives one from the
repo DID, collection, rkey, and `JSON.stringify(value)`. If object key order
matters to your test, pass an explicit `cid`.

- Use `FAKE_CID` when a test needs one valid placeholder CID and does not care
  about content
- Use `fakeCid(input)` when several records or blobs need stable but different
  CIDs
- Use `cidForRecord({ repo, collection, rkey, value })` when a test seeds a
  record without `cid` and later wants to assert on the CID the fake generated
