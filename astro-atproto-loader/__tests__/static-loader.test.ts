import { beforeEach, describe, expect, test, vi } from "vitest";
import type { LoaderContext } from "astro/loaders";

import { createAtProtoCache } from "../src/cache/index.ts";
import { atProtoStaticLoader } from "../src/loaders/static.ts";
import { installScriptedRepo } from "./msw/install.ts";

// Minimal LoaderContext stand-in: only `store` and `parseData` drive the
// static loader today; the rest are stubs so any new context usage fails
// loudly on a mock instead of an `undefined is not a function`.
const fakeLoaderContext = ({
  store,
  parseData,
}: {
  store: { clear: () => void; set: (entry: unknown) => unknown };
  parseData: (props: {
    id: string;
    data: Record<string, unknown>;
    filePath?: string;
  }) => Promise<Record<string, unknown>>;
}): LoaderContext =>
  ({
    collection: "static-test-collection",
    store,
    parseData,
    meta: new Map<string, string>(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    generateDigest: vi.fn(() => "digest"),
    config: {},
  }) as unknown as LoaderContext;

const staticHarness = (
  parseImpl: (props: {
    id: string;
    data: Record<string, unknown>;
    filePath?: string;
  }) => Promise<Record<string, unknown>> = async ({ data }) => data,
) => {
  const store = { clear: vi.fn(), set: vi.fn() };
  const parseData = vi.fn(parseImpl);
  return { store, parseData, context: fakeLoaderContext({ store, parseData }) };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("atProtoStaticLoader", () => {
  test("loads a single source into the Astro data store", async () => {
    installScriptedRepo({
      did: "did:plc:staticrepo",
      handle: "static.example.com",
      collection: "site.standard.document",
      pages: [
        [
          {
            rkey: "doc-1",
            value: { title: "Static doc", body: "Hello from Astro" },
          },
        ],
      ],
    });

    const { store, parseData, context } = staticHarness();

    const loader = atProtoStaticLoader({
      cache: createAtProtoCache(),
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

    await loader.load(context);

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
    installScriptedRepo({
      did: "did:plc:passthrough-static",
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

    const { store, parseData, context } = staticHarness();

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

    await loader.load(context);

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

  test("preserves Date values returned by parseData", async () => {
    installScriptedRepo({
      did: "did:plc:dates-static",
      handle: "dates.example.com",
      collection: "place.stream.livestream",
      pages: [
        [
          {
            rkey: "stream-1",
            value: {
              title: "Morning stream",
              createdAt: "2026-04-04T00:30:21Z",
            },
          },
        ],
      ],
    });

    const createdAt = new Date("2026-04-04T00:30:21Z");
    const { store, context } = staticHarness(async ({ data }) => ({
      ...data,
      createdAt,
    }));

    const loader = atProtoStaticLoader<
      readonly [{ repo: string; collection: string }],
      {
        title: string;
        createdAt: Date;
      }
    >({
      source: {
        repo: "dates.example.com",
        collection: "place.stream.livestream",
      },
    });

    await loader.load(context);

    expect(store.set).toHaveBeenCalledWith({
      id: "stream-1",
      data: {
        title: "Morning stream",
        createdAt,
      },
      body: undefined,
      filePath: undefined,
    });
    expect(store.set.mock.calls[0]?.[0].data.createdAt).toBeInstanceOf(Date);
  });

  test("surfaces schema parse failures from parseData", async () => {
    installScriptedRepo({
      did: "did:plc:staticrepo",
      handle: "static.example.com",
      collection: "site.standard.document",
      pages: [[{ rkey: "doc-1", value: { title: "Static doc" } }]],
    });

    const parseError = new Error(
      "Schema parse failed for did:plc:staticrepo/doc-1",
    );
    const { store, parseData, context } = staticHarness(async () => {
      throw parseError;
    });

    const loader = atProtoStaticLoader({
      cache: createAtProtoCache(),
      source: {
        repo: "static.example.com",
        collection: "site.standard.document",
      },
      transform: ({ value, rkey, repo }) => ({
        id: `${repo.did}/${rkey}`,
        data: { title: String(value.title), repo: repo.handle ?? repo.did },
      }),
    });

    await expect(loader.load(context)).rejects.toThrow(
      "Schema parse failed for did:plc:staticrepo/doc-1",
    );

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(parseData).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
  });

  test("supports multiple sources and deduplicates by transformed id", async () => {
    const bobatanPds = "https://bobatan-pds.fujocoded.test";
    const bobatanAltPds = "https://bobatan-alt-pds.fujocoded.test";

    installScriptedRepo({
      did: "did:plc:bobatan",
      handle: "bobatan.fujocoded.dev",
      pds: bobatanPds,
      collection: "site.standard.document",
      pages: [
        [
          {
            rkey: "alpha",
            value: { slug: "shared-post", title: "Older title" },
          },
        ],
      ],
    });
    installScriptedRepo({
      did: "did:plc:bobatan-alt",
      handle: "bobatan-alt.fujocoded.dev",
      pds: bobatanAltPds,
      collection: "site.standard.document",
      pages: [
        [
          {
            rkey: "beta",
            value: { slug: "shared-post", title: "Newer title" },
          },
        ],
      ],
    });

    const { store, context } = staticHarness();

    const loader = atProtoStaticLoader({
      cache: createAtProtoCache(),
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        {
          repo: "bobatan-alt.fujocoded.dev",
          collection: "site.standard.document",
        },
      ],
      transform: ({ value, repo }) => ({
        id: String(value.slug),
        data: { title: String(value.title), repo: repo.handle ?? repo.did },
      }),
    });

    await loader.load(context);

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith({
      id: "shared-post",
      data: { title: "Newer title", repo: "bobatan-alt.fujocoded.dev" },
      body: undefined,
      filePath: undefined,
    });
  });

  test("namespaces ids by did/collection when multiple static sources omit transform", async () => {
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

    const { store, context } = staticHarness();

    const loader = atProtoStaticLoader({
      cache: createAtProtoCache(),
      sources: [
        { repo: "bobatan.fujocoded.dev", collection: "site.standard.document" },
        {
          repo: "bobatan-alt.fujocoded.dev",
          collection: "site.standard.document",
        },
      ],
    });

    await loader.load(context);

    expect(store.set).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenNthCalledWith(1, {
      id: "did:plc:bobatan/site.standard.document/shared",
      data: { title: "Bobatan doc" },
      body: undefined,
      filePath: undefined,
    });
    expect(store.set).toHaveBeenNthCalledWith(2, {
      id: "did:plc:bobatan-alt/site.standard.document/shared",
      data: { title: "Alt doc" },
      body: undefined,
      filePath: undefined,
    });
  });
});
