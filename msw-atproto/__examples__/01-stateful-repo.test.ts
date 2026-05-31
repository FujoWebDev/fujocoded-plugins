import { AtpAgent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { describe, expect, test } from "vitest";

import { cidForRecord, useMockAtprotoRepo, FAKE_CID } from "../src/index.ts";
import { server } from "./msw/server.ts";

describe("stateful repo fake", () => {
  test("the smallest end-to-end fake of one Bluesky account, real client included", async () => {
    const did = "did:plc:bobatan";
    const handle = "bobatan.fujocoded.com";
    const avatarCid = FAKE_CID;
    const avatarBytes = new Uint8Array([137, 80, 78, 71]);

    const repo = useMockAtprotoRepo(server, {
      did,
      handle,
      records: {
        "app.bsky.feed.post": [
          { rkey: "seeded", value: { text: "already here" } },
        ],
      },
      blobs: [
        {
          cid: avatarCid,
          body: avatarBytes,
          contentType: "image/png",
        },
      ],
    });
    const agent = new AtpAgent({ service: repo.pds });

    const { data: created } = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: "app.bsky.feed.post",
      record: { text: "created during the test" },
    });

    const { data: listed } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.post",
    });

    const createdUri = new AtUri(created.uri);
    const { data: fetched } = await agent.com.atproto.repo.getRecord({
      repo: createdUri.hostname,
      collection: createdUri.collection,
      rkey: createdUri.rkey,
    });
    const avatar = await fetch(
      `${repo.pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
        did,
      )}&cid=${avatarCid}`,
    );

    expect(created).toMatchObject({
      uri: AtUri.make(did, "app.bsky.feed.post", "3kgenerated1").toString(),
      cid: cidForRecord({
        repo: did,
        collection: "app.bsky.feed.post",
        rkey: "3kgenerated1",
        value: { text: "created during the test" },
      }),
    });
    expect(listed).toMatchObject({
      records: [
        { uri: AtUri.make(did, "app.bsky.feed.post", "seeded").toString() },
        {
          uri: AtUri.make(did, "app.bsky.feed.post", "3kgenerated1").toString(),
        },
      ],
    });
    expect(fetched).toMatchObject({
      value: { text: "created during the test" },
    });
    expect(avatar.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await avatar.arrayBuffer())).toEqual(avatarBytes);

    await expect(
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: "app.bsky.graph.follow",
      }),
    ).rejects.toThrow();
  });
});
