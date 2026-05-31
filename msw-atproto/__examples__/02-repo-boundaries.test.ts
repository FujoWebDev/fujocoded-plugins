import { AtpAgent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { describe, expect, test } from "vitest";

import { useMockAtprotoRepo } from "../src/index.ts";
import { server } from "./msw/server.ts";

describe("repo boundaries", () => {
  test("use this when tests need to tell 'no records yet' apart from 'I forgot to seed'", async () => {
    const did = "did:plc:bobatan";
    const pds = "https://pds.fujocoded.test";
    const repo = useMockAtprotoRepo(server, { did, pds });

    repo.seed("app.bsky.feed.post", []);

    const agent = new AtpAgent({ service: pds });

    const { data: empty } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.post",
    });
    expect(empty).toEqual({ records: [] });

    await expect(
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: "app.bsky.graph.follow",
      }),
    ).rejects.toThrow();
  });

  test("use this when code reads from several accounts on one PDS", async () => {
    const mainDid = "did:plc:bobatan";
    const altDid = "did:plc:bobatan-alt";
    const pds = "https://pds.fujocoded.test";
    useMockAtprotoRepo(server, {
      did: mainDid,
      pds,
      records: {
        "app.bsky.feed.post": [{ rkey: "main-post", value: { text: "main" } }],
      },
    });
    useMockAtprotoRepo(server, {
      did: altDid,
      pds,
      records: {
        "app.bsky.feed.post": [{ rkey: "alt-post", value: { text: "alt" } }],
      },
    });

    const agent = new AtpAgent({ service: pds });

    const { data: mainList } = await agent.com.atproto.repo.listRecords({
      repo: mainDid,
      collection: "app.bsky.feed.post",
    });
    const { data: altList } = await agent.com.atproto.repo.listRecords({
      repo: altDid,
      collection: "app.bsky.feed.post",
    });

    expect(mainList).toMatchObject({
      records: [
        {
          uri: AtUri.make(
            mainDid,
            "app.bsky.feed.post",
            "main-post",
          ).toString(),
        },
      ],
    });
    expect(altList).toMatchObject({
      records: [
        {
          uri: AtUri.make(altDid, "app.bsky.feed.post", "alt-post").toString(),
        },
      ],
    });
  });

  test("re-resolving a handle reflects an identity override registered mid-test", async () => {
    const handle = "bobatan.fujocoded.com";
    const originalDid = "did:plc:bobatan";
    const newOwnerDid = "did:plc:bobatan-alt";
    const pds = "https://pds.fujocoded.test";
    const repo = useMockAtprotoRepo(server, { did: originalDid, handle, pds });

    const before = await fetch(`https://${handle}/.well-known/atproto-did`);
    expect(await before.text()).toBe(originalDid);

    server.use(repo.identity.handleResolvesTo(newOwnerDid));

    const after = await fetch(`https://${handle}/.well-known/atproto-did`);
    expect(await after.text()).toBe(newOwnerDid);
  });

  test("use this when the code under test walks a multi-page collection by following cursors", async () => {
    const did = "did:plc:bobatan";
    const repo = useMockAtprotoRepo(server, {
      did,
      records: {
        "app.bsky.feed.post": [
          { rkey: "post-1", value: { text: "one" } },
          { rkey: "post-2", value: { text: "two" } },
          { rkey: "post-3", value: { text: "three" } },
          { rkey: "post-4", value: { text: "four" } },
          { rkey: "post-5", value: { text: "five" } },
        ],
      },
    });
    const agent = new AtpAgent({ service: repo.pds });

    const pages: string[][] = [];
    let cursor: string | undefined;
    let lastCursor: string | undefined;
    do {
      const { data } = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: "app.bsky.feed.post",
        limit: 2,
        cursor,
      });
      pages.push(data.records.map((rec) => rec.uri));
      cursor = data.cursor;
      lastCursor = data.cursor;
    } while (cursor);

    expect(pages).toEqual([
      [
        AtUri.make(did, "app.bsky.feed.post", "post-1").toString(),
        AtUri.make(did, "app.bsky.feed.post", "post-2").toString(),
      ],
      [
        AtUri.make(did, "app.bsky.feed.post", "post-3").toString(),
        AtUri.make(did, "app.bsky.feed.post", "post-4").toString(),
      ],
      [AtUri.make(did, "app.bsky.feed.post", "post-5").toString()],
    ]);
    expect(lastCursor).toBeUndefined();
  });
});
