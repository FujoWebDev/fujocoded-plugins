import { AtpAgent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";

import { useMockAtprotoRepo, fakeCid } from "../src/index.ts";
import { server } from "./msw/server.ts";

// Use the stateful repo fake for normal ATproto behavior, even when the
// starting state is empty. Use raw MSW only for server behavior this package
// does not model, such as a cursor loop.
describe("empty repo and raw MSW for impossible server behavior", () => {
  test("use an empty stateful repo stub when a collection should have no records yet", async () => {
    const did = "did:plc:bobatan";
    const collection = "app.bsky.feed.post";
    const repo = useMockAtprotoRepo(server, { did });

    repo.seed(collection, []);

    const agent = new AtpAgent({ service: repo.pds });
    const { data } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
    });

    expect(data).toEqual({ records: [] });
  });

  test("use raw MSW for impossible pagination behavior such as a cursor loop", async () => {
    const did = "did:plc:bobatan";
    const collection = "app.bsky.feed.post";
    const rkey = "duplicate";
    const repo = useMockAtprotoRepo(server, { did });
    const record = {
      uri: AtUri.make(did, collection, rkey).toString(),
      cid: fakeCid("duplicate-page-record"),
      value: { text: "same record on every page" },
    };

    // Register the normal fake first, then a hand-authored endpoint override.
    // The repo fake handles the ordinary cases; raw MSW keeps weird server
    // behavior local to the one test that needs it.
    server.use(
      http.get(`${repo.pds}/xrpc/com.atproto.repo.listRecords`, () =>
        HttpResponse.json({
          records: [record],
          cursor: "again",
        }),
      ),
    );

    const listUrl = new URL(`${repo.pds}/xrpc/com.atproto.repo.listRecords`);
    listUrl.searchParams.set("repo", did);
    listUrl.searchParams.set("collection", collection);

    const first = await fetch(listUrl);
    const firstBody = await first.json();

    listUrl.searchParams.set("cursor", firstBody.cursor);
    const second = await fetch(listUrl);
    const secondBody = await second.json();

    expect(firstBody).toEqual({
      records: [record],
      cursor: "again",
    });
    expect(secondBody).toEqual({
      records: [record],
      cursor: "again",
    });
  });
});
