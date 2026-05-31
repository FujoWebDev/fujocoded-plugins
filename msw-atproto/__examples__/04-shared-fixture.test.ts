import { AtpAgent } from "@atproto/api";
import { AtUri } from "@atproto/syntax";
import { beforeEach, describe, expect, test } from "vitest";

import { useMockAtprotoRepo } from "../src/index.ts";
import { server } from "./msw/server.ts";

describe("shared fixture", () => {
  const did = "did:plc:bobatan";
  // The agent has to be created in `beforeEach`, not at describe time:
  // `AtpAgent` captures the `globalThis.fetch` reference it sees during
  // construction, and MSW only patches that reference inside `server.listen`
  // (which runs in `beforeAll`). An agent built too early holds the
  // unpatched fetch and bypasses every handler.
  let repo: ReturnType<typeof useMockAtprotoRepo>;
  let agent: AtpAgent;

  beforeEach(() => {
    repo = useMockAtprotoRepo(server, { did });
    repo.seed("app.bsky.feed.post", [
      { rkey: "seed", value: { text: "fresh seed" } },
    ]);
    agent = new AtpAgent({ service: repo.pds });
  });

  test("each test sees the seed and nothing else", async () => {
    const { data: listed } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.post",
    });

    expect(listed).toMatchObject({
      records: [
        { uri: AtUri.make(did, "app.bsky.feed.post", "seed").toString() },
      ],
    });
  });

  test("writes in one test do not leak into the next", async () => {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: "app.bsky.feed.post",
      record: { text: "written in test A" },
    });

    const { data: listed } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.post",
    });

    expect(listed.records).toHaveLength(2);
    expect(repo.writes()).toHaveLength(1);
  });

  test("a fresh write also persists on a clean slate", async () => {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: "app.bsky.feed.post",
      record: { text: "written in test B" },
    });

    const { data: listed } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.bsky.feed.post",
    });

    expect(listed.records).toHaveLength(2);
    expect(repo.writes()).toHaveLength(1);
  });
});
