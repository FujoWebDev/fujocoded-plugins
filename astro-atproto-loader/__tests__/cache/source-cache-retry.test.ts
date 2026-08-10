import { useMockAtprotoRepo } from "@fujocoded/msw-atproto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSourceCaches,
  SOURCE_RETRY_TTL_MS,
} from "../../src/cache/source-caches.ts";
import {
  createAtProtoCache,
  type AtProtoCache,
} from "../../src/cache/index.ts";
import { createFetchRecord } from "../../src/pipeline/fetch-record.ts";
import { server } from "../msw/server.ts";
import { trackXrpcRequests } from "../msw/track-requests.ts";

const COLLECTION = "site.standard.document";
const LIST_RECORDS = "com.atproto.repo.listRecords";
const DID = "did:plc:cacherepo";
const PDS = "https://cache-pds.example.test";

const UNAVAILABLE = {
  status: 503,
  error: "TemporarilyUnavailable",
  message: "TemporarilyUnavailable",
};

const installRepo = () =>
  useMockAtprotoRepo(server, {
    did: DID,
    pds: PDS,
    records: { [COLLECTION]: [{ rkey: "doc", value: { title: "warm" } }] },
  });

let caches: AtProtoCache;

const readTitles = async (read: () => Promise<{ value: unknown }[][]>) => {
  const sourceRecords = await read();
  return sourceRecords
    .flat()
    .map((args) => (args.value as { title: string }).title);
};

describe("source cache retry behavior", () => {
  beforeEach(() => {
    caches = createAtProtoCache();
  });

  afterEach(async () => {
    // Settle before restoring mocks so a late background refresh reports to
    // this test's silenced console, not the next test's spy.
    await caches.whenIdle();
    vi.restoreAllMocks();
  });

  it("serves stale records while throttling failed refreshes and recovering", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = installRepo();
    const calls = trackXrpcRequests(server);

    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const read = createSourceCaches({
      sources: [{ repo: DID, collection: COLLECTION }],
      callbacks: {},
      fetchRecord: createFetchRecord(caches),
      cacheTtl: 100,
      onSourceError: "throw",
      onInitialLoadError: "throw",
      caches,
    });

    await expect(readTitles(read)).resolves.toEqual(["warm"]);
    expect(calls.count(PDS, LIST_RECORDS)).toBe(1);

    // Stale read behind a failing refresh keeps serving the warm records.
    repo.failOnce.listRecords(UNAVAILABLE);
    repo.seed(COLLECTION, [{ rkey: "doc", value: { title: "recovered" } }]);
    now = 1_101;
    await expect(readTitles(read)).resolves.toEqual(["warm"]);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(calls.count(PDS, LIST_RECORDS)).toBe(2);

    // Inside the retry floor no new refresh is attempted.
    await expect(readTitles(read)).resolves.toEqual(["warm"]);
    now = 1_101 + SOURCE_RETRY_TTL_MS - 1;
    await expect(readTitles(read)).resolves.toEqual(["warm"]);
    await caches.whenIdle();
    expect(calls.count(PDS, LIST_RECORDS)).toBe(2);

    // Past the floor the refresh retries and the next read sees fresh data.
    now = 1_101 + SOURCE_RETRY_TTL_MS;
    await expect(readTitles(read)).resolves.toEqual(["warm"]);
    await vi.waitFor(async () => {
      await expect(readTitles(read)).resolves.toEqual(["recovered"]);
    });
    expect(calls.count(PDS, LIST_RECORDS)).toBe(3);
  });

  it("does not apply the retry floor before the first successful load", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = installRepo();
    const calls = trackXrpcRequests(server);
    repo.failOnce.listRecords(UNAVAILABLE);
    repo.failOnce.listRecords(UNAVAILABLE);

    const read = createSourceCaches({
      sources: [{ repo: DID, collection: COLLECTION }],
      callbacks: {},
      fetchRecord: createFetchRecord(caches),
      cacheTtl: 100,
      onSourceError: "throw",
      onInitialLoadError: "throw",
      caches,
    });

    await expect(read()).rejects.toMatchObject({
      message: expect.stringContaining("TemporarilyUnavailable"),
    });
    await expect(read()).rejects.toMatchObject({
      message: expect.stringContaining("TemporarilyUnavailable"),
    });
    expect(calls.count(PDS, LIST_RECORDS)).toBe(2);
  });

  it("degrades a cold failure to an empty read under the 'empty' policy", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = installRepo();
    repo.failOnce.listRecords(UNAVAILABLE);

    const read = createSourceCaches({
      sources: [{ repo: DID, collection: COLLECTION }],
      callbacks: {},
      fetchRecord: createFetchRecord(caches),
      cacheTtl: 100,
      onSourceError: "throw",
      onInitialLoadError: "empty",
      caches,
    });

    await expect(read()).resolves.toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("refresh failed:"),
      expect.anything(),
    );
  });

  it("resolves whenIdle immediately when nothing is tracked", async () => {
    await expect(createAtProtoCache().whenIdle()).resolves.toBeUndefined();
  });

  it("waits out tracked refreshes, including failed and chained ones", async () => {
    const cache = createAtProtoCache();
    let release!: () => void;
    const refresh = new Promise<void>((resolve) => {
      release = resolve;
    });
    cache.onRefresh(
      refresh.then(() => {
        // A settling refresh may start more work; idle must cover the cascade.
        cache.onRefresh(Promise.reject(new Error("chained")));
      }),
    );

    let idle = false;
    const wait = cache.whenIdle().then(() => {
      idle = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idle).toBe(false);

    release();
    await wait;
    expect(idle).toBe(true);
  });
});
