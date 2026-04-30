import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { server } from "./msw/server.ts";
import {
  FAKE_CID,
  failingGetRecord,
  mockGetRecord,
  mockListRecords,
  mockRepoIdentity,
  type FakeRecord,
} from "./msw/handlers.ts";

const PDS = "https://pds.example.test";

const importLoader = async () => {
  vi.resetModules();
  const live = await import("../src/loaders/live.ts");
  const staticLoader = await import("../src/loaders/static.ts");
  return {
    atProtoLiveLoader: live.atProtoLiveLoader,
    atProtoStaticLoader: staticLoader.atProtoStaticLoader,
  };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("atProtoLiveLoader", () => {
  test("loads a collection, applies the object callback signature, and resolves handles", async () => {
    server.use(
      ...mockRepoIdentity({
        did: "did:plc:resolved-handle",
        pds: PDS,
        handle: "events.example.com",
      }),
      mockListRecords({
        pds: PDS,
        repo: "events.example.com",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:resolved-handle",
              rkey: "first",
              value: { title: "Opening", published: true },
            },
            {
              did: "did:plc:resolved-handle",
              rkey: "second",
              value: { title: "Draft", published: false },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const filterSpy = vi.fn(
      ({ value }: { value: Record<string, unknown> }) =>
        value.published === true,
    );
    const transformSpy = vi.fn(
      ({
        value,
        rkey,
        repo,
      }: {
        value: Record<string, unknown>;
        rkey: string;
        repo: { did: string; handle?: string };
      }) => ({
        id: rkey,
        data: {
          did: repo.did,
          title: String(value.title),
        },
      }),
    );

    const loader = atProtoLiveLoader({
      source: {
        repo: "events.example.com",
        collection: "community.lexicon.calendar.event",
      },
      filter: filterSpy,
      transform: transformSpy,
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      {
        id: "first",
        data: {
          did: "did:plc:resolved-handle",
          title: "Opening",
        },
      },
    ]);
    expect(filterSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        value: { title: "Opening", published: true },
        repo: { did: "did:plc:resolved-handle", handle: "events.example.com" },
        collection: "community.lexicon.calendar.event",
        rkey: "first",
      }),
    );
    expect(transformSpy).toHaveBeenCalledTimes(1);
  });

  test("sends the listRecords XRPC query with the configured limit and no initial cursor", async () => {
    const cursorCalls: Array<string | null> = [];

    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:testrepo",
              rkey: "only",
              value: { title: "Only" },
            },
          ],
        ],
        onCall: (cursor) => cursorCalls.push(cursor),
      }),
    );

    const requestLog: Array<{ limit: string | null; cursor: string | null }> =
      [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
        requestLog.push({
          limit: url.searchParams.get("limit"),
          cursor: url.searchParams.get("cursor"),
        });
      }
    });

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    await loader.loadCollection({});

    expect(requestLog).toEqual([{ limit: "100", cursor: null }]);
    expect(cursorCalls).toEqual([null]);
  });

  test("stops after `source.limit` entries and skips remaining pages", async () => {
    const cursorCalls: Array<string | null> = [];

    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            { did: "did:plc:testrepo", rkey: "one", value: { title: "A" } },
            { did: "did:plc:testrepo", rkey: "two", value: { title: "B" } },
            { did: "did:plc:testrepo", rkey: "three", value: { title: "C" } },
          ],
          [{ did: "did:plc:testrepo", rkey: "four", value: { title: "D" } }],
        ],
        onCall: (cursor) => cursorCalls.push(cursor),
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        limit: 2,
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      { id: "one", data: { title: "A" } },
      { id: "two", data: { title: "B" } },
    ]);
    expect(cursorCalls).toEqual([null]);
  });

  test("caps the XRPC listRecords page size at `source.limit`", async () => {
    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [{ did: "did:plc:testrepo", rkey: "only", value: { title: "Only" } }],
        ],
      }),
    );

    const requestLog: Array<{ limit: string | null }> = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
        requestLog.push({ limit: url.searchParams.get("limit") });
      }
    });

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        limit: 5,
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    await loader.loadCollection({});

    expect(requestLog).toEqual([{ limit: "5" }]);
  });

  test("counts only post-filter entries against `source.limit`", async () => {
    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:testrepo",
              rkey: "one",
              value: { title: "A", published: false },
            },
            {
              did: "did:plc:testrepo",
              rkey: "two",
              value: { title: "B", published: true },
            },
            {
              did: "did:plc:testrepo",
              rkey: "three",
              value: { title: "C", published: false },
            },
            {
              did: "did:plc:testrepo",
              rkey: "four",
              value: { title: "D", published: true },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        limit: 2,
      },
      filter: ({ value }) => value.published === true,
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      { id: "two", data: { title: "B" } },
      { id: "four", data: { title: "D" } },
    ]);
  });

  test("deduplicates collection entries by id and keeps the newest one", async () => {
    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:testrepo",
              rkey: "early",
              value: { slug: "session-1", title: "First title" },
            },
            {
              did: "did:plc:testrepo",
              rkey: "later",
              value: { slug: "session-1", title: "Updated title" },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      transform: ({ value }) => ({
        id: String(value.slug),
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      {
        id: "session-1",
        data: { title: "Updated title" },
      },
    ]);
  });

  test("supports request-time collection filtering", async () => {
    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:testrepo",
              rkey: "one",
              value: { track: "main", title: "Main stage" },
            },
            {
              did: "did:plc:testrepo",
              rkey: "two",
              value: { track: "hallway", title: "Hallway track" },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader<
      readonly [{ repo: string; collection: string }],
      { title: string; track: string },
      { track: string }
    >({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: {
          title: String(value.title),
          track: String(value.track),
        },
      }),
      queryFilter: ({ entry, filter }) => entry.data.track === filter.track,
    });

    const result = await loader.loadCollection({
      filter: { track: "hallway" },
    });

    expect("entries" in result && result.entries).toEqual([
      {
        id: "two",
        data: { title: "Hallway track", track: "hallway" },
      },
    ]);
  });

  test("supports a dedicated single-source `source` option", async () => {
    server.use(
      ...mockRepoIdentity({
        did: "did:plc:source-option",
        pds: PDS,
        handle: "source.example.com",
      }),
      mockListRecords({
        pds: PDS,
        repo: "source.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:source-option",
              rkey: "doc-1",
              value: { title: "From source" },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "source.example.com",
        collection: "site.standard.document",
      },
      transform: ({ value, rkey, repo, collection }) => ({
        id: `${repo.did}/${rkey}`,
        data: {
          title: String(value.title),
          repo: repo.handle ?? repo.did,
          collection,
        },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      {
        id: "did:plc:source-option/doc-1",
        data: {
          title: "From source",
          repo: "source.example.com",
          collection: "site.standard.document",
        },
      },
    ]);
  });

  test("defaults to passthrough entries for a single source when transform is omitted", async () => {
    server.use(
      ...mockRepoIdentity({
        did: "did:plc:passthrough-live",
        pds: PDS,
        handle: "passthrough.example.com",
      }),
      mockListRecords({
        pds: PDS,
        repo: "passthrough.example.com",
        collection: "place.stream.livestream",
        pages: [
          [
            {
              did: "did:plc:passthrough-live",
              rkey: "stream-1",
              value: {
                title: "Coworking stream",
                createdAt: "2026-04-04T00:30:21Z",
              },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader<
      readonly [{ repo: string; collection: string }],
      {
        title: string;
        createdAt: string;
      }
    >({
      source: {
        repo: "passthrough.example.com",
        collection: "place.stream.livestream",
      },
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      {
        id: "stream-1",
        data: {
          title: "Coworking stream",
          createdAt: "2026-04-04T00:30:21Z",
        },
      },
    ]);
  });

  test("supports multiple sources under one loader", async () => {
    const bobatanPds = "https://bobatan-pds.example.test";
    const bobPds = "https://bob-pds.example.test";

    server.use(
      ...mockRepoIdentity({
        did: "did:plc:bobatan",
        pds: bobatanPds,
        handle: "bobatan.fujocoded.dev",
      }),
      ...mockRepoIdentity({
        did: "did:plc:bob",
        pds: bobPds,
        handle: "bob.example.com",
      }),
      mockListRecords({
        pds: bobatanPds,
        repo: "bobatan.fujocoded.dev",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bobatan",
              rkey: "alpha",
              value: { title: "Bobatan doc" },
            },
          ],
        ],
      }),
      mockListRecords({
        pds: bobPds,
        repo: "bob.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bob",
              rkey: "beta",
              value: { title: "Bob doc" },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        { repo: "bob.example.com", collection: "site.standard.document" },
      ],
      transform: ({ value, rkey, repo, collection }) => ({
        id: `${repo.did}/${collection}/${rkey}`,
        data: {
          title: String(value.title),
          repo: repo.handle ?? repo.did,
        },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      {
        id: "did:plc:bobatan/site.standard.document/alpha",
        data: { title: "Bobatan doc", repo: "bobatan.fujocoded.dev" },
      },
      {
        id: "did:plc:bob/site.standard.document/beta",
        data: { title: "Bob doc", repo: "bob.example.com" },
      },
    ]);
  });

  test("namespaces ids by did/collection when multiple sources omit transform", async () => {
    const bobatanPds = "https://bobatan-pds.example.test";
    const bobPds = "https://bob-pds.example.test";

    server.use(
      ...mockRepoIdentity({
        did: "did:plc:bobatan",
        pds: bobatanPds,
        handle: "bobatan.fujocoded.dev",
      }),
      ...mockRepoIdentity({
        did: "did:plc:bob",
        pds: bobPds,
        handle: "bob.example.com",
      }),
      mockListRecords({
        pds: bobatanPds,
        repo: "bobatan.fujocoded.dev",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bobatan",
              rkey: "shared",
              value: { title: "Bobatan doc" },
            },
          ],
        ],
      }),
      mockListRecords({
        pds: bobPds,
        repo: "bob.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bob",
              rkey: "shared",
              value: { title: "Bob doc" },
            },
          ],
        ],
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        { repo: "bob.example.com", collection: "site.standard.document" },
      ],
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      {
        id: "did:plc:bobatan/site.standard.document/shared",
        data: { title: "Bobatan doc" },
      },
      {
        id: "did:plc:bob/site.standard.document/shared",
        data: { title: "Bob doc" },
      },
    ]);
  });

  test("loads a single entry directly by rkey and supports custom ids", async () => {
    const record: FakeRecord = {
      did: "did:plc:testrepo",
      rkey: "record-123",
      value: { slug: "opening-keynote", title: "Opening keynote" },
    };

    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockGetRecord({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        record,
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      transform: ({ value }) => ({
        id: String(value.slug),
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadEntry({
      filter: { id: "opening-keynote", rkey: "record-123" },
    });

    expect(result).toEqual({
      id: "opening-keynote",
      data: { title: "Opening keynote" },
    });
  });

  test("defaults single-record lookups to rkey ids when transform is omitted", async () => {
    const record: FakeRecord = {
      did: "did:plc:passthrough-live",
      rkey: "stream-1",
      value: {
        title: "Coworking stream",
        createdAt: "2026-04-04T00:30:21Z",
      },
    };

    server.use(
      ...mockRepoIdentity({ did: "did:plc:passthrough-live", pds: PDS }),
      mockGetRecord({
        pds: PDS,
        repo: "did:plc:passthrough-live",
        collection: "place.stream.livestream",
        record,
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader<
      readonly [{ repo: string; collection: string }],
      {
        title: string;
        createdAt: string;
      }
    >({
      source: {
        repo: "did:plc:passthrough-live",
        collection: "place.stream.livestream",
      },
    });

    const result = await loader.loadEntry({
      filter: { id: "stream-1" },
    });

    expect(result).toEqual({
      id: "stream-1",
      data: {
        title: "Coworking stream",
        createdAt: "2026-04-04T00:30:21Z",
      },
    });
  });

  test("can disambiguate direct single-record loads across multiple sources", async () => {
    const bobatanPds = "https://bobatan-pds.example.test";
    const bobPds = "https://bob-pds.example.test";

    let bobatanGetRecordCalls = 0;
    let bobGetRecordCalls = 0;

    server.use(
      ...mockRepoIdentity({
        did: "did:plc:bobatan",
        pds: bobatanPds,
        handle: "bobatan.fujocoded.dev",
      }),
      ...mockRepoIdentity({
        did: "did:plc:bob",
        pds: bobPds,
        handle: "bob.example.com",
      }),
      http.get(`${bobatanPds}/xrpc/com.atproto.repo.getRecord`, () => {
        bobatanGetRecordCalls += 1;
        return new HttpResponse(JSON.stringify({ error: "UnexpectedCall" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }),
      http.get(`${bobPds}/xrpc/com.atproto.repo.getRecord`, ({ request }) => {
        bobGetRecordCalls += 1;
        const url = new URL(request.url);
        expect(url.searchParams.get("repo")).toBe("bob.example.com");
        expect(url.searchParams.get("collection")).toBe(
          "site.standard.document",
        );
        expect(url.searchParams.get("rkey")).toBe("shared-rkey");
        return HttpResponse.json({
          uri: "at://did:plc:bob/site.standard.document/shared-rkey",
          cid: FAKE_CID,
          value: { slug: "bob/shared-rkey", title: "Bob shared doc" },
        });
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        { repo: "bob.example.com", collection: "site.standard.document" },
      ],
      transform: ({ value }) => ({
        id: String(value.slug),
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadEntry({
      filter: {
        id: "bob/shared-rkey",
        rkey: "shared-rkey",
        repo: "bob.example.com",
        collection: "site.standard.document",
      },
    });

    expect(result).toEqual({
      id: "bob/shared-rkey",
      data: { title: "Bob shared doc" },
    });
    expect(bobatanGetRecordCalls).toBe(0);
    expect(bobGetRecordCalls).toBe(1);
  });

  test("returns stale cached entries while a background refresh is in flight", async () => {
    let callCount = 0;
    let resolveSecondFetch: (() => void) | undefined;

    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
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

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
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

    expect("entries" in first && first.entries?.[0]?.data.title).toBe(
      "Initial title",
    );
    expect("entries" in stale && stale.entries?.[0]?.data.title).toBe(
      "Initial title",
    );

    await vi.waitFor(() => {
      expect(resolveSecondFetch).toBeDefined();
    });
    resolveSecondFetch?.();

    await vi.waitFor(async () => {
      const refreshed = await loader.loadCollection({});
      expect("entries" in refreshed && refreshed.entries?.[0]?.data.title).toBe(
        "Refreshed title",
      );
    });
  });

  test("falls back to the cached collection if direct single-record loading fails", async () => {
    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:testrepo",
              rkey: "record-123",
              value: { slug: "opening-keynote", title: "Opening keynote" },
            },
          ],
        ],
      }),
      failingGetRecord(PDS),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      transform: ({ value }) => ({
        id: String(value.slug),
        data: { title: String(value.title) },
      }),
    });

    await loader.loadCollection({});
    const result = await loader.loadEntry({
      filter: { id: "opening-keynote", rkey: "record-123" },
    });

    expect(result).toEqual({
      id: "opening-keynote",
      data: { title: "Opening keynote" },
    });
  });

  test("follows the cursor across multiple pages of listRecords", async () => {
    const observedCursors: Array<string | null> = [];

    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      mockListRecords({
        pds: PDS,
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        pages: [
          [
            {
              did: "did:plc:testrepo",
              rkey: "one",
              value: { title: "Page one entry" },
            },
            {
              did: "did:plc:testrepo",
              rkey: "two",
              value: { title: "Page one entry two" },
            },
          ],
          [
            {
              did: "did:plc:testrepo",
              rkey: "three",
              value: { title: "Page two entry" },
            },
          ],
        ],
        onCall: (cursor) => observedCursors.push(cursor),
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
        limit: "all",
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      { id: "one", data: { title: "Page one entry" } },
      { id: "two", data: { title: "Page one entry two" } },
      { id: "three", data: { title: "Page two entry" } },
    ]);
    expect(observedCursors).toEqual([null, "1"]);
  });

  test("terminates the cursor loop once the PDS omits a next cursor", async () => {
    let callCount = 0;

    server.use(
      ...mockRepoIdentity({ did: "did:plc:testrepo", pds: PDS }),
      http.get(`${PDS}/xrpc/com.atproto.repo.listRecords`, () => {
        callCount += 1;
        return HttpResponse.json({
          records:
            callCount === 1
              ? [
                  {
                    uri: "at://did:plc:testrepo/community.lexicon.calendar.event/only",
                    cid: FAKE_CID,
                    value: { title: "Only" },
                  },
                ]
              : [],
          // cursor intentionally omitted on every page
        });
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      source: {
        repo: "did:plc:testrepo",
        collection: "community.lexicon.calendar.event",
      },
      transform: ({ value, rkey }) => ({
        id: rkey,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect(callCount).toBe(1);
    expect("entries" in result && result.entries).toEqual([
      { id: "only", data: { title: "Only" } },
    ]);
  });

  test("paginates each source independently when combined with multi-source", async () => {
    const bobatanPds = "https://bobatan-pds.example.test";
    const bobPds = "https://bob-pds.example.test";

    const bobatanCursors: Array<string | null> = [];
    const bobCursors: Array<string | null> = [];

    server.use(
      ...mockRepoIdentity({ did: "did:plc:bobatan", pds: bobatanPds }),
      ...mockRepoIdentity({ did: "did:plc:bob", pds: bobPds }),
      mockListRecords({
        pds: bobatanPds,
        repo: "did:plc:bobatan",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bobatan",
              rkey: "alpha",
              value: { title: "Bobatan page one" },
            },
          ],
          [
            {
              did: "did:plc:bobatan",
              rkey: "alpha-two",
              value: { title: "Bobatan page two" },
            },
          ],
        ],
        onCall: (cursor) => bobatanCursors.push(cursor),
      }),
      mockListRecords({
        pds: bobPds,
        repo: "did:plc:bob",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bob",
              rkey: "beta",
              value: { title: "Bob only page" },
            },
          ],
        ],
        onCall: (cursor) => bobCursors.push(cursor),
      }),
    );

    const { atProtoLiveLoader } = await importLoader();

    const loader = atProtoLiveLoader({
      sources: [
        {
          repo: "did:plc:bobatan",
          collection: "site.standard.document",
          limit: "all",
        },
        {
          repo: "did:plc:bob",
          collection: "site.standard.document",
          limit: "all",
        },
      ],
      transform: ({ value, repo, rkey }) => ({
        id: `${repo.did}/${rkey}`,
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadCollection({});

    expect("entries" in result && result.entries).toEqual([
      { id: "did:plc:bobatan/alpha", data: { title: "Bobatan page one" } },
      { id: "did:plc:bobatan/alpha-two", data: { title: "Bobatan page two" } },
      { id: "did:plc:bob/beta", data: { title: "Bob only page" } },
    ]);
    expect(bobatanCursors).toEqual([null, "1"]);
    expect(bobCursors).toEqual([null]);
  });
});

describe("atProtoStaticLoader", () => {
  test("loads a single source into the Astro data store", async () => {
    server.use(
      ...mockRepoIdentity({
        did: "did:plc:staticrepo",
        pds: PDS,
        handle: "static.example.com",
      }),
      mockListRecords({
        pds: PDS,
        repo: "static.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:staticrepo",
              rkey: "doc-1",
              value: { title: "Static doc", body: "Hello from Astro" },
            },
          ],
        ],
      }),
    );

    const { atProtoStaticLoader } = await importLoader();

    const store = { clear: vi.fn(), set: vi.fn() };
    const parseData = vi.fn(async ({ data }) => data);

    const loader = atProtoStaticLoader({
      source: {
        repo: "static.example.com",
        collection: "site.standard.document",
      },
      transform: ({ value, rkey, repo }) => ({
        id: `${repo.did}/${rkey}`,
        data: { title: String(value.title), repo: repo.handle ?? repo.did },
        body: String(value.body),
      }),
    });

    await loader.load({
      store,
      parseData,
    } as unknown as Parameters<typeof loader.load>[0]);

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(parseData).toHaveBeenCalledWith({
      id: "did:plc:staticrepo/doc-1",
      data: { title: "Static doc", repo: "static.example.com" },
      filePath: undefined,
    });
    expect(store.set).toHaveBeenCalledWith({
      id: "did:plc:staticrepo/doc-1",
      data: { title: "Static doc", repo: "static.example.com" },
      body: "Hello from Astro",
      filePath: undefined,
    });
  });

  test("defaults to passthrough entries for a single source when transform is omitted", async () => {
    server.use(
      ...mockRepoIdentity({
        did: "did:plc:passthrough-static",
        pds: PDS,
        handle: "passthrough.example.com",
      }),
      mockListRecords({
        pds: PDS,
        repo: "passthrough.example.com",
        collection: "place.stream.livestream",
        pages: [
          [
            {
              did: "did:plc:passthrough-static",
              rkey: "stream-1",
              value: {
                title: "Coworking stream",
                createdAt: "2026-04-04T00:30:21Z",
              },
            },
          ],
        ],
      }),
    );

    const { atProtoStaticLoader } = await importLoader();

    const store = { clear: vi.fn(), set: vi.fn() };
    const parseData = vi.fn(async ({ data }) => data);

    const loader = atProtoStaticLoader<
      readonly [{ repo: string; collection: string }],
      {
        title: string;
        createdAt: string;
      }
    >({
      source: {
        repo: "passthrough.example.com",
        collection: "place.stream.livestream",
      },
    });

    await loader.load({
      store,
      parseData,
    } as unknown as Parameters<typeof loader.load>[0]);

    expect(parseData).toHaveBeenCalledWith({
      id: "stream-1",
      data: {
        title: "Coworking stream",
        createdAt: "2026-04-04T00:30:21Z",
      },
      filePath: undefined,
    });
    expect(store.set).toHaveBeenCalledWith({
      id: "stream-1",
      data: {
        title: "Coworking stream",
        createdAt: "2026-04-04T00:30:21Z",
      },
      body: undefined,
      filePath: undefined,
    });
  });

  test("surfaces schema parse failures from parseData", async () => {
    server.use(
      ...mockRepoIdentity({
        did: "did:plc:staticrepo",
        pds: PDS,
        handle: "static.example.com",
      }),
      mockListRecords({
        pds: PDS,
        repo: "static.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:staticrepo",
              rkey: "doc-1",
              value: { title: "Static doc" },
            },
          ],
        ],
      }),
    );

    const { atProtoStaticLoader } = await importLoader();

    const store = { clear: vi.fn(), set: vi.fn() };
    const parseError = new Error(
      "Schema parse failed for did:plc:staticrepo/doc-1",
    );
    const parseData = vi.fn(async () => {
      throw parseError;
    });

    const loader = atProtoStaticLoader({
      source: {
        repo: "static.example.com",
        collection: "site.standard.document",
      },
      transform: ({ value, rkey, repo }) => ({
        id: `${repo.did}/${rkey}`,
        data: { title: String(value.title), repo: repo.handle ?? repo.did },
      }),
    });

    await expect(
      loader.load({
        store,
        parseData,
      } as unknown as Parameters<typeof loader.load>[0]),
    ).rejects.toThrow("Schema parse failed for did:plc:staticrepo/doc-1");

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(parseData).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
  });

  test("supports multiple sources and deduplicates by transformed id", async () => {
    const bobatanPds = "https://bobatan-pds.example.test";
    const bobPds = "https://bob-pds.example.test";

    server.use(
      ...mockRepoIdentity({
        did: "did:plc:bobatan",
        pds: bobatanPds,
        handle: "bobatan.fujocoded.dev",
      }),
      ...mockRepoIdentity({
        did: "did:plc:bob",
        pds: bobPds,
        handle: "bob.example.com",
      }),
      mockListRecords({
        pds: bobatanPds,
        repo: "bobatan.fujocoded.dev",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bobatan",
              rkey: "alpha",
              value: { slug: "shared-post", title: "Older title" },
            },
          ],
        ],
      }),
      mockListRecords({
        pds: bobPds,
        repo: "bob.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bob",
              rkey: "beta",
              value: { slug: "shared-post", title: "Newer title" },
            },
          ],
        ],
      }),
    );

    const { atProtoStaticLoader } = await importLoader();

    const store = { clear: vi.fn(), set: vi.fn() };
    const parseData = vi.fn(async ({ data }) => data);

    const loader = atProtoStaticLoader({
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        { repo: "bob.example.com", collection: "site.standard.document" },
      ],
      transform: ({ value, repo }) => ({
        id: String(value.slug),
        data: { title: String(value.title), repo: repo.handle ?? repo.did },
      }),
    });

    await loader.load({
      store,
      parseData,
    } as unknown as Parameters<typeof loader.load>[0]);

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith({
      id: "shared-post",
      data: { title: "Newer title", repo: "bob.example.com" },
      body: undefined,
      filePath: undefined,
    });
  });

  test("namespaces ids by did/collection when multiple static sources omit transform", async () => {
    const bobatanPds = "https://bobatan-pds.example.test";
    const bobPds = "https://bob-pds.example.test";

    server.use(
      ...mockRepoIdentity({
        did: "did:plc:bobatan",
        pds: bobatanPds,
        handle: "bobatan.fujocoded.dev",
      }),
      ...mockRepoIdentity({
        did: "did:plc:bob",
        pds: bobPds,
        handle: "bob.example.com",
      }),
      mockListRecords({
        pds: bobatanPds,
        repo: "bobatan.fujocoded.dev",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bobatan",
              rkey: "shared",
              value: { title: "Bobatan doc" },
            },
          ],
        ],
      }),
      mockListRecords({
        pds: bobPds,
        repo: "bob.example.com",
        collection: "site.standard.document",
        pages: [
          [
            {
              did: "did:plc:bob",
              rkey: "shared",
              value: { title: "Bob doc" },
            },
          ],
        ],
      }),
    );

    const { atProtoStaticLoader } = await importLoader();

    const store = { clear: vi.fn(), set: vi.fn() };
    const parseData = vi.fn(async ({ data }) => data);

    const loader = atProtoStaticLoader({
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        { repo: "bob.example.com", collection: "site.standard.document" },
      ],
    });

    await loader.load({
      store,
      parseData,
    } as unknown as Parameters<typeof loader.load>[0]);

    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenNthCalledWith(1, {
      id: "did:plc:bobatan/site.standard.document/shared",
      data: { title: "Bobatan doc" },
      body: undefined,
      filePath: undefined,
    });
    expect(store.set).toHaveBeenNthCalledWith(2, {
      id: "did:plc:bob/site.standard.document/shared",
      data: { title: "Bob doc" },
      body: undefined,
      filePath: undefined,
    });
  });
});
