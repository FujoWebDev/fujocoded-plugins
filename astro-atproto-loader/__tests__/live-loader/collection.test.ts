import { beforeEach, describe, expect, test, vi } from "vitest";

import { createAtProtoCache } from "../../src/cache/index.ts";
import { atProtoLiveLoader } from "../../src/loaders/live.ts";
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
  test("loads a collection, applies the object callback signature, and resolves handles", async () => {
    installScriptedRepo({
      did: "did:plc:resolved-handle",
      handle: "events.example.com",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          { rkey: "first", value: { title: "Opening", published: true } },
          { rkey: "second", value: { title: "Draft", published: false } },
        ],
      ],
    });

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
      cache: createAtProtoCache(),
      source: {
        repo: "events.example.com",
        collection: "community.lexicon.calendar.event",
      },
      filter: filterSpy,
      transform: transformSpy,
    });

    const result = await loader.loadCollection({});

    expect(entriesOf(result)).toEqual([
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
        repo: {
          did: "did:plc:resolved-handle",
          handle: "events.example.com",
          pds: PDS,
        },
        collection: "community.lexicon.calendar.event",
        rkey: "first",
      }),
    );
    expect(transformSpy).toHaveBeenCalledTimes(1);
  });

  test("deduplicates collection entries by id and keeps the newest one", async () => {
    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          {
            rkey: "early",
            value: { slug: "session-1", title: "First title" },
          },
          {
            rkey: "later",
            value: { slug: "session-1", title: "Updated title" },
          },
        ],
      ],
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

    const result = await loader.loadCollection({});

    expect(entriesOf(result)).toEqual([
      {
        id: "session-1",
        data: { title: "Updated title" },
      },
    ]);
  });

  test("supports request-time collection filtering", async () => {
    installScriptedRepo({
      did: "did:plc:testrepo",
      collection: "community.lexicon.calendar.event",
      pages: [
        [
          { rkey: "one", value: { track: "main", title: "Main stage" } },
          {
            rkey: "two",
            value: { track: "hallway", title: "Hallway track" },
          },
        ],
      ],
    });

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

    expect(entriesOf(result)).toEqual([
      {
        id: "two",
        data: { title: "Hallway track", track: "hallway" },
      },
    ]);
  });

  test("supports a dedicated single-source `source` option", async () => {
    installScriptedRepo({
      did: "did:plc:source-option",
      handle: "source.example.com",
      collection: "site.standard.document",
      pages: [[{ rkey: "doc-1", value: { title: "From source" } }]],
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
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

    expect(entriesOf(result)).toEqual([
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
    installScriptedRepo({
      did: "did:plc:passthrough-live",
      handle: "passthrough.example.com",
      collection: "place.stream.livestream",
      pages: [
        [
          {
            rkey: "stream-1",
            value: {
              title: "Coworking stream",
              createdAt: "2026-04-04T00:30:21Z",
            },
          },
        ],
      ],
    });

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

    expect(entriesOf(result)).toEqual([
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
    const bobatanPds = "https://bobatan-pds.fujocoded.test";
    const bobatanAltPds = "https://bobatan-alt-pds.fujocoded.test";

    installScriptedRepo({
      did: "did:plc:bobatan",
      handle: "bobatan.fujocoded.dev",
      pds: bobatanPds,
      collection: "site.standard.document",
      pages: [[{ rkey: "alpha", value: { title: "Bobatan doc" } }]],
    });
    installScriptedRepo({
      did: "did:plc:bobatan-alt",
      handle: "bobatan-alt.fujocoded.dev",
      pds: bobatanAltPds,
      collection: "site.standard.document",
      pages: [[{ rkey: "beta", value: { title: "Alt doc" } }]],
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        {
          repo: "bobatan-alt.fujocoded.dev",
          collection: "site.standard.document",
        },
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

    expect(entriesOf(result)).toEqual([
      {
        id: "did:plc:bobatan/site.standard.document/alpha",
        data: { title: "Bobatan doc", repo: "bobatan.fujocoded.dev" },
      },
      {
        id: "did:plc:bobatan-alt/site.standard.document/beta",
        data: { title: "Alt doc", repo: "bobatan-alt.fujocoded.dev" },
      },
    ]);
  });

  test("namespaces ids by did/collection when multiple sources omit transform", async () => {
    const bobatanPds = "https://bobatan-pds.fujocoded.test";
    const bobatanAltPds = "https://bobatan-alt-pds.fujocoded.test";

    installScriptedRepo({
      did: "did:plc:bobatan",
      handle: "bobatan.fujocoded.dev",
      pds: bobatanPds,
      collection: "site.standard.document",
      pages: [[{ rkey: "shared", value: { title: "Bobatan doc" } }]],
    });
    installScriptedRepo({
      did: "did:plc:bobatan-alt",
      handle: "bobatan-alt.fujocoded.dev",
      pds: bobatanAltPds,
      collection: "site.standard.document",
      pages: [[{ rkey: "shared", value: { title: "Alt doc" } }]],
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        {
          repo: "bobatan-alt.fujocoded.dev",
          collection: "site.standard.document",
        },
      ],
    });

    const result = await loader.loadCollection({});

    expect(entriesOf(result)).toEqual([
      {
        id: "did:plc:bobatan/site.standard.document/shared",
        data: { title: "Bobatan doc" },
      },
      {
        id: "did:plc:bobatan-alt/site.standard.document/shared",
        data: { title: "Alt doc" },
      },
    ]);
  });

  test("groups records across sources and passes each group to transform", async () => {
    const bobatanPds = "https://bobatan-pds.fujocoded.test";
    const bobatanAltPds = "https://bobatan-alt-pds.fujocoded.test";

    installScriptedRepo({
      did: "did:plc:bobatan",
      pds: bobatanPds,
      collection: "site.standard.document",
      pages: [
        [
          { rkey: "a", value: { slug: "shared", title: "Bobatan version" } },
          { rkey: "b", value: { slug: "solo", title: "Only entry" } },
        ],
      ],
    });
    installScriptedRepo({
      did: "did:plc:bobatan-alt",
      pds: bobatanAltPds,
      collection: "site.standard.document",
      pages: [[{ rkey: "c", value: { slug: "shared", title: "Alt version" } }]],
    });

    const loader = atProtoLiveLoader({
      cache: createAtProtoCache(),
      sources: [
        { repo: "did:plc:bobatan", collection: "site.standard.document" },
        { repo: "did:plc:bobatan-alt", collection: "site.standard.document" },
      ],
      groupBy: ({ value }) => String(value.slug),
      transform: ({ key, records }) => ({
        id: key,
        data: {
          titles: records.map((record) => String(record.value.title)),
        },
      }),
    });

    const result = await loader.loadCollection({});

    expect(entriesOf(result)).toEqual([
      { id: "shared", data: { titles: ["Bobatan version", "Alt version"] } },
      { id: "solo", data: { titles: ["Only entry"] } },
    ]);
  });
});
