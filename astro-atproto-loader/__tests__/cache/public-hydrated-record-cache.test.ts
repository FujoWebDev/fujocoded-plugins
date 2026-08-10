import { FAKE_CID, useMockAtprotoRepo } from "@fujocoded/msw-atproto";
import { z } from "astro/zod";
import { http, HttpResponse } from "msw";
import { afterEach, expect, test, vi } from "vitest";

import { server } from "../msw/server.ts";
import { trackXrpcRequests } from "../msw/track-requests.ts";
import {
  createAtProtoCache,
  HYDRATED_RECORD_CACHE_TTL,
  HYDRATED_RECORD_NOT_FOUND_TTL,
  HYDRATED_RECORD_RETRY_TTL,
  type AtProtoCache,
} from "../../src/cache/index.ts";
import { defineAtProtoLiveCollection } from "../../src/index.ts";

vi.mock("astro/content/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("astro/content/config")>();
  return {
    ...actual,
    defineLiveCollection: vi.fn((config) => config),
  };
});

const DID = "did:plc:public-cache";
const PDS = "https://public-cache-pds.example.test";
const SOURCE_COLLECTION = "site.standard.document";
const HYDRATED_COLLECTION = "app.example.hydrated";
const HYDRATED_URI = `at://${DID}/${HYDRATED_COLLECTION}/shared`;
const GET_RECORD = "com.atproto.repo.getRecord";

const installSource = () => {
  return useMockAtprotoRepo(server, {
    did: DID,
    pds: PDS,
    records: {
      [SOURCE_COLLECTION]: [
        { rkey: "source", value: { target: HYDRATED_URI } },
      ],
      [HYDRATED_COLLECTION]: [{ rkey: "shared", value: { version: 1 } }],
    },
  });
};

const createPublicLoader = (cache?: AtProtoCache) => {
  return defineAtProtoLiveCollection({
    ...(cache ? { cache } : {}),
    source: { repo: DID, collection: SOURCE_COLLECTION },
    outputSchema: z.object({ hydrated: z.unknown() }),
    transform: async ({ rkey, fetchRecord }) => ({
      id: rkey,
      data: { hydrated: await fetchRecord({ atUri: HYDRATED_URI }) },
    }),
  }).loader;
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("shares public fetchRecord results across loaders", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  installSource();
  const calls = trackXrpcRequests(server);

  const firstLoader = createPublicLoader();
  const secondLoader = createPublicLoader();

  const first = await firstLoader.loadCollection({});
  now = HYDRATED_RECORD_CACHE_TTL - 1;
  const shared = await secondLoader.loadCollection({});

  expect(first).toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 1 } } } }],
  });
  expect(shared).toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 1 } } } }],
  });
  expect(calls.count(PDS, GET_RECORD)).toBe(1);
});

test("expires hydrated records after five minutes", async () => {
  const cache = createAtProtoCache();
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const repo = installSource();
  const calls = trackXrpcRequests(server);
  const loader = createPublicLoader(cache);

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 1 } } } }],
  });

  repo.seed(HYDRATED_COLLECTION, [{ rkey: "shared", value: { version: 2 } }]);
  now = HYDRATED_RECORD_CACHE_TTL - 1;
  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 1 } } } }],
  });
  expect(calls.count(PDS, GET_RECORD)).toBe(1);

  now = HYDRATED_RECORD_CACHE_TTL;
  const expired = await loader.loadCollection({});

  expect(expired).toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 2 } } } }],
  });
  expect(calls.count(PDS, GET_RECORD)).toBe(2);
});

test("keeps explicitly separate loader caches isolated", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const repo = installSource();

  const firstLoader = createPublicLoader(createAtProtoCache());
  const secondLoader = createPublicLoader(createAtProtoCache());

  await expect(firstLoader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 1 } } } }],
  });

  repo.seed(HYDRATED_COLLECTION, [{ rkey: "shared", value: { version: 2 } }]);
  now = 1;

  await expect(secondLoader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: { value: { version: 2 } } } }],
  });
});

test("retries public fetchRecord failures after the fixed five-second floor", async () => {
  const cache = createAtProtoCache();
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const repo = installSource();
  repo.seed(HYDRATED_COLLECTION, [
    { rkey: "shared", value: { recovered: true } },
  ]);
  repo.failOnce.getRecord({
    collection: HYDRATED_COLLECTION,
    rkey: "shared",
    status: 503,
  });

  const firstLoader = createPublicLoader(cache);
  const secondLoader = createPublicLoader(cache);

  await expect(firstLoader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });
  now = HYDRATED_RECORD_RETRY_TTL - 1;
  await expect(secondLoader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });

  now = HYDRATED_RECORD_RETRY_TTL;
  await expect(secondLoader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: { value: { recovered: true } } } }],
  });
});

test("holds record-not-found failures for the full five-minute TTL", async () => {
  const cache = createAtProtoCache();
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  installSource();

  let getRecordCalls = 0;
  server.use(
    http.get(`${PDS}/xrpc/com.atproto.repo.getRecord`, () => {
      getRecordCalls += 1;
      return HttpResponse.json(
        { error: "RecordNotFound", message: "Could not locate record" },
        { status: 400 },
      );
    }),
  );

  const loader = createPublicLoader(cache);

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });
  expect(getRecordCalls).toBe(1);

  // Past the transient retry floor: a missing record must stay cached.
  now = HYDRATED_RECORD_RETRY_TTL;
  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });
  expect(getRecordCalls).toBe(1);

  now = HYDRATED_RECORD_NOT_FOUND_TTL;
  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });
  expect(getRecordCalls).toBe(2);
});

test("holds non-object record values for the full five-minute TTL", async () => {
  const cache = createAtProtoCache();
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  installSource();

  let getRecordCalls = 0;
  server.use(
    http.get(`${PDS}/xrpc/com.atproto.repo.getRecord`, () => {
      getRecordCalls += 1;
      // An array passes the lexicon's `unknown` validation (it's an object to
      // `typeof`) but can never be a usable record value. Scalars don't reach
      // the loader at all: the XRPC client rejects them as invalid responses,
      // which stay transient.
      return HttpResponse.json({
        uri: HYDRATED_URI,
        cid: FAKE_CID,
        value: [],
      });
    }),
  );

  const loader = createPublicLoader(cache);

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });

  now = HYDRATED_RECORD_RETRY_TTL;
  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ data: { hydrated: null } }],
  });
  expect(getRecordCalls).toBe(1);
});

test("deduplicates concurrent same-URI hydration through public loaders", async () => {
  const cache = createAtProtoCache();
  let getRecordCalls = 0;
  let releaseHydration: (() => void) | undefined;
  installSource();
  server.use(
    http.get(`${PDS}/xrpc/com.atproto.repo.getRecord`, async () => {
      getRecordCalls += 1;
      await new Promise<void>((resolve) => {
        releaseHydration = resolve;
      });
      return HttpResponse.json({
        uri: HYDRATED_URI,
        cid: FAKE_CID,
        value: { shared: true },
      });
    }),
  );

  const firstLoader = createPublicLoader(cache);
  const secondLoader = createPublicLoader(cache);
  const pending = Promise.all([
    firstLoader.loadCollection({}),
    secondLoader.loadCollection({}),
  ]);

  await vi.waitFor(() => expect(getRecordCalls).toBe(1));
  releaseHydration?.();

  await expect(pending).resolves.toEqual([
    expect.objectContaining({
      entries: [
        expect.objectContaining({
          data: {
            hydrated: expect.objectContaining({ value: { shared: true } }),
          },
        }),
      ],
    }),
    expect.objectContaining({
      entries: [
        expect.objectContaining({
          data: {
            hydrated: expect.objectContaining({ value: { shared: true } }),
          },
        }),
      ],
    }),
  ]);
  expect(getRecordCalls).toBe(1);
});
