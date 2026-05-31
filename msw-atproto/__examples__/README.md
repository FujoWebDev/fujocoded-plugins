# `@fujocoded/msw-atproto` testing examples

These tests use [Vitest](https://vitest.dev/) and [MSW](https://mswjs.io/) to show
you how to use `@fujocoded/msw-atproto` in your own tests!

Pick the file that matches your test:

- [`01-stateful-repo.test.ts`](./01-stateful-repo.test.ts): One fake Bluesky
  account, real `AtpAgent` calls, seeded records, writes, reads, and blobs
- [`02-repo-boundaries.test.ts`](./02-repo-boundaries.test.ts): Empty
  collections, several accounts on one PDS, identity changes, and cursor-based
  pagination
- [`03-empty-repo-and-raw-msw.test.ts`](./03-empty-repo-and-raw-msw.test.ts):
  An intentionally empty account, plus raw MSW for server behavior this package
  does not model
- [`04-shared-fixture.test.ts`](./04-shared-fixture.test.ts): One shared setup
  pattern for a suite where every test starts from the same state

Run the example suite from the repo root:

```sh
npm test --workspace @fujocoded/msw-atproto -- __examples__
```
