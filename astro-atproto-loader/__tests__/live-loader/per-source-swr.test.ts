import { useMockAtprotoRepo } from "@fujocoded/msw-atproto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SOURCE_RETRY_TTL_MS } from "../../src/cache/source-caches.ts";
import {
  createAtProtoCache,
  type AtProtoCache,
} from "../../src/cache/index.ts";
import { atProtoLiveLoader } from "../../src/loaders/live.ts";
import { server } from "../msw/server.ts";
import { trackXrpcRequests } from "../msw/track-requests.ts";

const COLLECTION = "site.standard.document";
const LIST_RECORDS = "com.atproto.repo.listRecords";
const MAIN_DID = "did:plc:bobatan";
const MAIN_PDS = "https://bobatan-pds.fujocoded.test";
const ALT_DID = "did:plc:bobatan-alt";
const ALT_PDS = "https://bobatan-alt-pds.fujocoded.test";

const UNAVAILABLE = {
  status: 503,
  error: "TemporarilyUnavailable",
  message: "TemporarilyUnavailable",
};

const titled = (rkey: string, title: string) => [{ rkey, value: { title } }];

const installSources = () => ({
  main: useMockAtprotoRepo(server, {
    did: MAIN_DID,
    pds: MAIN_PDS,
    records: { [COLLECTION]: titled("main", "Main warm") },
  }),
  alt: useMockAtprotoRepo(server, {
    did: ALT_DID,
    pds: ALT_PDS,
    records: { [COLLECTION]: titled("alt", "Alt warm") },
  }),
});

const byDidAndRkey = ({
  repo,
  rkey,
  value,
}: {
  repo: { did: string };
  rkey: string;
  value: Record<string, unknown>;
}) => ({
  id: `${repo.did}/${rkey}`,
  data: { title: String(value.title) },
});

let cache: AtProtoCache;

beforeEach(() => {
  cache = createAtProtoCache();
});

afterEach(async () => {
  // Settle before restoring mocks so a late background refresh reports to
  // this test's silenced console, not the next test's spy.
  await cache.whenIdle();
  vi.restoreAllMocks();
});

test("keeps a failed source's warm records beside a healthy source's refresh", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { main, alt } = installSources();
  const calls = trackXrpcRequests(server);

  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    cacheTtl: 1,
    transform: byDidAndRkey,
  });

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [
      { id: `${MAIN_DID}/main`, data: { title: "Main warm" } },
      { id: `${ALT_DID}/alt`, data: { title: "Alt warm" } },
    ],
  });

  main.failOnce.listRecords(UNAVAILABLE);
  alt.seed(COLLECTION, titled("alt", "Alt fresh"));
  now = 1_002;
  await loader.loadCollection({});

  await vi.waitFor(async () => {
    await expect(loader.loadCollection({})).resolves.toMatchObject({
      entries: [
        { id: `${MAIN_DID}/main`, data: { title: "Main warm" } },
        { id: `${ALT_DID}/alt`, data: { title: "Alt fresh" } },
      ],
    });
  });
  // The message format itself is pinned in the dedicated operator-report
  // test below; here we only care that the failure was reported once.
  await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(2);
  expect(calls.count(ALT_PDS, LIST_RECORDS)).toBe(2);
});

test("reports one underlying error through the real source-reader handler", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const main = useMockAtprotoRepo(server, {
    did: MAIN_DID,
    pds: MAIN_PDS,
    records: { [COLLECTION]: titled("main", "Main warm") },
  });
  const calls = trackXrpcRequests(server);

  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  const loader = atProtoLiveLoader({
    cache,
    source: { repo: MAIN_DID, collection: COLLECTION },
    cacheTtl: 1,
  });

  await loader.loadCollection({});
  main.failOnce.listRecords(UNAVAILABLE);
  now = 1_002;
  await loader.loadCollection({});

  await vi.waitFor(() => {
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `[atproto-loader] source ${MAIN_DID}/${COLLECTION} refresh failed:`,
      ),
      expect.objectContaining({
        message: expect.stringContaining("TemporarilyUnavailable"),
      }),
    );
  });
  expect(warn.mock.calls[0]?.[1]).toBeInstanceOf(Error);
  // One failed refresh attempt must produce exactly one operator report.
  expect(warn).toHaveBeenCalledTimes(1);
  expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(2);
});

test("omits only a source that fails before it has warm records", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { main } = installSources();
  const calls = trackXrpcRequests(server);
  main.failOnce.listRecords(UNAVAILABLE);

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    cacheTtl: 1,
    transform: byDidAndRkey,
  });

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ id: `${ALT_DID}/alt`, data: { title: "Alt warm" } }],
  });
  expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(1);
  expect(calls.count(ALT_PDS, LIST_RECORDS)).toBe(1);
});

test("passes each source failure to an onSourceError callback with its source", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { main } = installSources();
  main.failOnce.listRecords(UNAVAILABLE);
  const onSourceError = vi.fn(() => "skip" as const);

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    onSourceError,
    transform: byDidAndRkey,
  });

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [{ id: `${ALT_DID}/alt`, data: { title: "Alt warm" } }],
  });
  expect(onSourceError).toHaveBeenCalledTimes(1);
  expect(onSourceError).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining("TemporarilyUnavailable"),
    }),
    expect.objectContaining({ repo: MAIN_DID, collection: COLLECTION }),
  );
});

test("keeps each source on its own refresh schedule", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { main, alt } = installSources();
  const calls = trackXrpcRequests(server);

  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    cacheTtl: 10,
    transform: byDidAndRkey,
  });

  await loader.loadCollection({});

  // Past both TTLs: main refreshes; alt's refresh fails, starting its
  // private retry floor. Wait for both outcomes to land before touching the
  // clock again — a refresh completing after a clock jump would stamp its
  // cache time with the jumped value.
  main.seed(COLLECTION, titled("main", "Main refreshed"));
  alt.failOnce.listRecords(UNAVAILABLE);
  now = 1_011;
  await loader.loadCollection({});
  await vi.waitFor(async () => {
    await expect(loader.loadCollection({})).resolves.toMatchObject({
      entries: [
        { id: `${MAIN_DID}/main`, data: { title: "Main refreshed" } },
        { id: `${ALT_DID}/alt`, data: { title: "Alt warm" } },
      ],
    });
  });
  await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

  // Main is stale again and refetches; alt is still inside its retry
  // floor and must not.
  alt.seed(COLLECTION, titled("alt", "Alt recovered"));
  now = 1_011 + SOURCE_RETRY_TTL_MS - 1;
  await loader.loadCollection({});
  await vi.waitFor(() => expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(3));
  await cache.whenIdle();
  expect(calls.count(ALT_PDS, LIST_RECORDS)).toBe(2);

  // One tick later the floor has elapsed: alt retries and recovers while
  // main stays fresh.
  now = 1_011 + SOURCE_RETRY_TTL_MS;
  await loader.loadCollection({});
  await vi.waitFor(async () => {
    await expect(loader.loadCollection({})).resolves.toMatchObject({
      entries: [
        { id: `${MAIN_DID}/main`, data: { title: "Main refreshed" } },
        { id: `${ALT_DID}/alt`, data: { title: "Alt recovered" } },
      ],
    });
  });
  await cache.whenIdle();
  expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(3);
  expect(calls.count(ALT_PDS, LIST_RECORDS)).toBe(3);
});

test("preserves the cold-start error when every source fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { main, alt } = installSources();
  const calls = trackXrpcRequests(server);
  main.failOnce.listRecords({
    status: 503,
    error: "MainSourceUnavailable",
    message: "MainSourceUnavailable",
  });
  alt.failOnce.listRecords({
    status: 503,
    error: "AltSourceUnavailable",
    message: "AltSourceUnavailable",
  });

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    onInitialLoadError: "throw",
    transform: byDidAndRkey,
  });

  const result = await loader.loadCollection({});

  expect(result).toHaveProperty("error");
  if (!("error" in result) || !result.error) {
    throw new Error("Expected the live loader to return an error");
  }
  expect(result.error.cause).toBeInstanceOf(AggregateError);
  const aggregate = result.error.cause as AggregateError;
  expect(aggregate.message).toBe("All AtProto sources failed");
  expect(aggregate.errors).toHaveLength(2);
  expect(
    aggregate.errors.map((error) =>
      error instanceof Error && "error" in error ? error.error : undefined,
    ),
  ).toEqual(["MainSourceUnavailable", "AltSourceUnavailable"]);
  expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(1);
  expect(calls.count(ALT_PDS, LIST_RECORDS)).toBe(1);
});

test("serves every last-good record set when every warm source fails", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { main, alt } = installSources();
  const calls = trackXrpcRequests(server);

  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    cacheTtl: 1,
    onInitialLoadError: "throw",
    transform: byDidAndRkey,
  });

  await loader.loadCollection({});
  main.failOnce.listRecords(UNAVAILABLE);
  alt.failOnce.listRecords(UNAVAILABLE);
  now = 1_002;
  await loader.loadCollection({});
  await vi.waitFor(() => {
    expect(calls.count(MAIN_PDS, LIST_RECORDS)).toBe(2);
    expect(calls.count(ALT_PDS, LIST_RECORDS)).toBe(2);
  });

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [
      { id: `${MAIN_DID}/main`, data: { title: "Main warm" } },
      { id: `${ALT_DID}/alt`, data: { title: "Alt warm" } },
    ],
  });
  // One report per failing source; the message format is pinned in the
  // dedicated operator-report test above.
  await vi.waitFor(() => {
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

test("preserves source order and last-value dedupe when every source is healthy", async () => {
  useMockAtprotoRepo(server, {
    did: MAIN_DID,
    pds: MAIN_PDS,
    records: {
      [COLLECTION]: [
        { rkey: "first", value: { slug: "first", title: "First" } },
        {
          rkey: "old-shared",
          value: { slug: "shared", title: "Old shared" },
        },
      ],
    },
  });
  useMockAtprotoRepo(server, {
    did: ALT_DID,
    pds: ALT_PDS,
    records: {
      [COLLECTION]: [
        { rkey: "second", value: { slug: "second", title: "Second" } },
        {
          rkey: "new-shared",
          value: { slug: "shared", title: "New shared" },
        },
      ],
    },
  });

  const loader = atProtoLiveLoader({
    cache,
    sources: [
      { repo: MAIN_DID, collection: COLLECTION },
      { repo: ALT_DID, collection: COLLECTION },
    ],
    transform: ({ value }) => ({
      id: String(value.slug),
      data: { title: String(value.title) },
    }),
  });

  await expect(loader.loadCollection({})).resolves.toMatchObject({
    entries: [
      { id: "first", data: { title: "First" } },
      { id: "shared", data: { title: "New shared" } },
      { id: "second", data: { title: "Second" } },
    ],
  });
});
