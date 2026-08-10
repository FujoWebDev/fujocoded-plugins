import {
  createMockRepoIdentity,
  FAKE_CID,
  useMockAtprotoRepo,
} from "@fujocoded/msw-atproto";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAtProtoCache } from "../../src/cache/index.ts";
import { atProtoLiveLoader } from "../../src/loaders/live.ts";
import { server } from "../msw/server.ts";
import { PDS } from "../msw/install.ts";

const TEST_REPO = "did:plc:testrepo";
const CALENDAR_COLLECTION = "community.lexicon.calendar.event";

const installCalendarRepo = () =>
  useMockAtprotoRepo(server, {
    did: TEST_REPO,
    pds: PDS,
    records: {
      [CALENDAR_COLLECTION]: [
        { rkey: "first", value: { title: "Initial title" } },
      ],
    },
  });

// Unwraps a loadCollection result so a loader error fails the test with the
// actual error instead of an `expected false to equal [...]` diff.
const entriesOf = (result: object) => {
  if ("error" in result && result.error instanceof Error) {
    throw new Error(`loader returned an error: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return "entries" in result ? result.entries : undefined;
};

// Type-safe checker for tests that expect a loader error; the `in` check
// narrows the `{ error } | LiveDataCollection` union, which plain
// `result.error` cannot.
const errorOf = (result: object) =>
  "error" in result && result.error instanceof Error ? result.error : undefined;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("atProtoLiveLoader", () => {
  test("returns stale cached entries while a background refresh is in flight", async () => {
    let callCount = 0;
    let resolveSecondFetch: (() => void) | undefined;

    server.use(
      ...createMockRepoIdentity({
        did: "did:plc:testrepo",
        pds: PDS,
      }).handlers(),
      http.get(`${PDS}/xrpc/com.atproto.repo.listRecords`, async () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({
            records: [
              {
                uri: "at://did:plc:testrepo/community.lexicon.calendar.event/first",
                cid: FAKE_CID,
                value: { title: "Initial title" },
              },
            ],
          });
        }
        await new Promise<void>((resolve) => {
          resolveSecondFetch = resolve;
        });
        return HttpResponse.json({
          records: [
            {
              uri: "at://did:plc:testrepo/community.lexicon.calendar.event/first",
              cid: FAKE_CID,
              value: { title: "Refreshed title" },
            },
          ],
        });
      }),
    );

    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      cacheTtl: 1,
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const first = await loader.loadCollection({});
    now = 1_005;
    const stale = await loader.loadCollection({});

    expect(entriesOf(first)).toMatchObject([
      { data: { title: "Initial title" } },
    ]);
    expect(entriesOf(stale)).toMatchObject([
      { data: { title: "Initial title" } },
    ]);

    await vi.waitFor(() => {
      expect(resolveSecondFetch).toBeDefined();
    });
    resolveSecondFetch?.();

    await vi.waitFor(async () => {
      const refreshed = await loader.loadCollection({});
      expect(entriesOf(refreshed)).toMatchObject([
        { data: { title: "Refreshed title" } },
      ]);
    });
  });

  test("returns a loader error when a warm-cache transform fails", async () => {
    installCalendarRepo();

    let shouldThrow = false;
    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: TEST_REPO,
        collection: CALENDAR_COLLECTION,
      },
      transform: ({ value, rkey }) => {
        if (shouldThrow) throw new Error("warm transform failed");
        return { id: rkey, data: { title: String(value.title) } };
      },
    });

    await expect(loader.loadCollection({})).resolves.toMatchObject({
      entries: [{ id: "first", data: { title: "Initial title" } }],
    });
    shouldThrow = true;

    const result = await loader.loadCollection({});

    expect(errorOf(result)?.cause).toEqual(new Error("warm transform failed"));
  });

  test("returns a loader error for a cold transform failure under the default empty policy", async () => {
    installCalendarRepo();

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: TEST_REPO,
        collection: CALENDAR_COLLECTION,
      },
      transform: () => {
        throw new Error("cold transform failed");
      },
    });

    const result = await loader.loadCollection({});

    expect(errorOf(result)?.cause).toEqual(new Error("cold transform failed"));
  });

  test("returns a loader error when groupBy fails under the default empty policy", async () => {
    installCalendarRepo();

    const transform = vi.fn(() => ({
      id: "unused",
      data: { title: "unused" },
    }));
    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: TEST_REPO,
        collection: CALENDAR_COLLECTION,
      },
      groupBy: () => {
        throw new Error("groupBy failed");
      },
      transform,
    });

    const result = await loader.loadCollection({});

    expect(errorOf(result)?.cause).toEqual(new Error("groupBy failed"));
    expect(transform).not.toHaveBeenCalled();
  });

  test("surfaces the initial collection fetch error when onInitialLoadError is 'throw'", async () => {
    const repo = installCalendarRepo();
    repo.failOnce.listRecords({
      collection: CALENDAR_COLLECTION,
      status: 503,
      error: "TemporarilyUnavailable",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: TEST_REPO,
        collection: CALENDAR_COLLECTION,
      },
      onInitialLoadError: "throw",
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect(errorOf(result)?.message).toBe(
      "Failed to load the AtProto record from collection community.lexicon.calendar.event",
    );
  });

  test("degrades a cold-start collection failure to an empty collection by default", async () => {
    const repo = installCalendarRepo();
    repo.failOnce.listRecords({
      collection: CALENDAR_COLLECTION,
      status: 503,
      error: "TemporarilyUnavailable",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: TEST_REPO,
        collection: CALENDAR_COLLECTION,
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect(result).toMatchObject({ entries: [] });
  });

  test("degrades a cold-start entry failure to a missing entry by default", async () => {
    const repo = installCalendarRepo();
    repo.failOnce.getRecord({
      collection: CALENDAR_COLLECTION,
      rkey: "record-123",
      status: 503,
      error: "TemporarilyUnavailable",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      source: {
        repo: TEST_REPO,
        collection: CALENDAR_COLLECTION,
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadEntry({
      filter: { id: "opening-keynote", rkey: "record-123" },
    });

    expect(result).toBeUndefined();
  });
});
