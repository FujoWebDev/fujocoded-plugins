import { createMockRepoIdentity, FAKE_CID } from "@fujocoded/msw-atproto";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAtProtoCache } from "../../src/cache/index.ts";
import { atProtoLiveLoader } from "../../src/loaders/live.ts";
import { server } from "../msw/server.ts";
import { failingGetRecord } from "../msw/handlers.ts";
import {
  installScriptedRecord,
  installScriptedRepo,
  PDS,
} from "../msw/install.ts";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("atProtoLiveLoader", () => {
  test("loads a single entry directly by rkey and supports custom ids", async () => {
    installScriptedRecord({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      record: {
        rkey: "record-123",
        value: { slug: "opening-keynote", title: "Opening keynote" },
      },
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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
    installScriptedRecord({
      did: "did:plc:passthrough-live",
      collection: "place.stream.livestream",
      record: {
        rkey: "stream-1",
        value: {
          title: "Coworking stream",
          createdAt: "2026-04-04T00:30:21Z",
        },
      },
    });

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
    const bobatanPds = "https://bobatan-pds.fujocoded.test";
    const bobatanAltPds = "https://bobatan-alt-pds.fujocoded.test";

    let bobatanGetRecordCalls = 0;
    const bobatanAltGetRecordParams: Array<{
      repo: string | null;
      collection: string | null;
      rkey: string | null;
    }> = [];

    server.use(
      ...createMockRepoIdentity({
        did: "did:plc:bobatan",
        pds: bobatanPds,
        handle: "bobatan.fujocoded.dev",
      }).handlers(),
      ...createMockRepoIdentity({
        did: "did:plc:bobatan-alt",
        pds: bobatanAltPds,
        handle: "bobatan-alt.fujocoded.dev",
      }).handlers(),
      http.get(`${bobatanPds}/xrpc/com.atproto.repo.getRecord`, () => {
        bobatanGetRecordCalls += 1;
        return new HttpResponse(JSON.stringify({ error: "UnexpectedCall" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }),
      http.get(
        `${bobatanAltPds}/xrpc/com.atproto.repo.getRecord`,
        ({ request }) => {
          const url = new URL(request.url);
          bobatanAltGetRecordParams.push({
            repo: url.searchParams.get("repo"),
            collection: url.searchParams.get("collection"),
            rkey: url.searchParams.get("rkey"),
          });
          return HttpResponse.json({
            uri: "at://did:plc:bobatan-alt/site.standard.document/shared-rkey",
            cid: FAKE_CID,
            value: { slug: "alt/shared-rkey", title: "Alt shared doc" },
          });
        },
      ),
    );

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        {
          repo: "bobatan-alt.fujocoded.dev",
          collection: "site.standard.document",
        },
      ],
      transform: ({ value }) => ({
        id: String(value.slug),
        data: { title: String(value.title) },
      }),
    });

    const result = await loader.loadEntry({
      filter: {
        id: "alt/shared-rkey",
        rkey: "shared-rkey",
        repo: "bobatan-alt.fujocoded.dev",
        collection: "site.standard.document",
      },
    });

    expect(result).toEqual({
      id: "alt/shared-rkey",
      data: { title: "Alt shared doc" },
    });
    expect(bobatanGetRecordCalls).toBe(0);
    expect(bobatanAltGetRecordParams).toEqual([
      {
        repo: "bobatan-alt.fujocoded.dev",
        collection: "site.standard.document",
        rkey: "shared-rkey",
      },
    ]);
  });
  test("falls back to the cached collection if direct single-record loading fails", async () => {
    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          {
            rkey: "record-123",
            value: { slug: "opening-keynote", title: "Opening keynote" },
          },
        ],
      ],
    });
    server.use(failingGetRecord(PDS));

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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
});
