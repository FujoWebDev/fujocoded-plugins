import { createMockRepoIdentity, FAKE_CID } from "@fujocoded/msw-atproto";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAtProtoCache } from "../../src/cache/index.ts";
import { atProtoLiveLoader } from "../../src/loaders/live.ts";
import { server } from "../msw/server.ts";
import { installScriptedRepo, PDS } from "../msw/install.ts";

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("atProtoLiveLoader", () => {
  test("sends the listRecords XRPC query with the configured limit and no initial cursor", async () => {
    const cursorCalls: Array<string | null> = [];

    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [[{ rkey: "only", value: { title: "Only" } }]],
      onCall: (cursor) => cursorCalls.push(cursor),
    });

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

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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

    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          { rkey: "one", value: { title: "A" } },
          { rkey: "two", value: { title: "B" } },
          { rkey: "three", value: { title: "C" } },
        ],
        [{ rkey: "four", value: { title: "D" } }],
      ],
      onCall: (cursor) => cursorCalls.push(cursor),
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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

    expect(entriesOf(result)).toEqual([
      { id: "one", data: { title: "A" } },
      { id: "two", data: { title: "B" } },
    ]);
    expect(cursorCalls).toEqual([null]);
  });

  test("caps the XRPC listRecords page size at `source.limit`", async () => {
    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [[{ rkey: "only", value: { title: "Only" } }]],
    });

    const requestLog: Array<{ limit: string | null }> = [];
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
        requestLog.push({ limit: url.searchParams.get("limit") });
      }
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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
    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          { rkey: "one", value: { title: "A", published: false } },
          { rkey: "two", value: { title: "B", published: true } },
          { rkey: "three", value: { title: "C", published: false } },
          { rkey: "four", value: { title: "D", published: true } },
        ],
      ],
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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

    expect(entriesOf(result)).toEqual([
      { id: "two", data: { title: "B" } },
      { id: "four", data: { title: "D" } },
    ]);
  });

  test("follows the cursor across multiple pages of listRecords", async () => {
    const observedCursors: Array<string | null> = [];

    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          { rkey: "one", value: { title: "Page one entry" } },
          { rkey: "two", value: { title: "Page one entry two" } },
        ],
        [{ rkey: "three", value: { title: "Page two entry" } }],
      ],
      onCall: (cursor) => observedCursors.push(cursor),
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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

    expect(entriesOf(result)).toEqual([
      { id: "one", data: { title: "Page one entry" } },
      { id: "two", data: { title: "Page one entry two" } },
      { id: "three", data: { title: "Page two entry" } },
    ]);
    expect(observedCursors).toEqual([null, "1"]);
  });

  test("terminates the cursor loop once the PDS omits a next cursor", async () => {
    let callCount = 0;

    server.use(
      ...createMockRepoIdentity({
        did: "did:plc:testrepo",
        pds: PDS,
      }).handlers(),
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

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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
    expect(entriesOf(result)).toEqual([
      { id: "only", data: { title: "Only" } },
    ]);
  });

  test("paginates each source independently when combined with multi-source", async () => {
    const bobatanPds = "https://bobatan-pds.fujocoded.test";
    const bobatanAltPds = "https://bobatan-alt-pds.fujocoded.test";

    const bobatanCursors: Array<string | null> = [];
    const bobatanAltCursors: Array<string | null> = [];

    installScriptedRepo({
      did: "did:plc:bobatan",
      pds: bobatanPds,
      collection: "site.standard.document",
      pages: [
        [{ rkey: "alpha", value: { title: "Bobatan page one" } }],
        [{ rkey: "alpha-two", value: { title: "Bobatan page two" } }],
      ],
      onCall: (cursor) => bobatanCursors.push(cursor),
    });
    installScriptedRepo({
      did: "did:plc:bobatan-alt",
      pds: bobatanAltPds,
      collection: "site.standard.document",
      pages: [[{ rkey: "beta", value: { title: "Alt only page" } }]],
      onCall: (cursor) => bobatanAltCursors.push(cursor),
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      sources: [
        {
          repo: "did:plc:bobatan",
          collection: "site.standard.document",
          limit: "all",
        },
        {
          repo: "did:plc:bobatan-alt",
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

    expect(entriesOf(result)).toEqual([
      { id: "did:plc:bobatan/alpha", data: { title: "Bobatan page one" } },
      { id: "did:plc:bobatan/alpha-two", data: { title: "Bobatan page two" } },
      { id: "did:plc:bobatan-alt/beta", data: { title: "Alt only page" } },
    ]);
    expect(bobatanCursors).toEqual([null, "1"]);
    expect(bobatanAltCursors).toEqual([null]);
  });
});
