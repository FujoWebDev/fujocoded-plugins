import { AtUri } from "@atproto/syntax";
import { describe, expect, it } from "vitest";

import {
  COLLECTION,
  DID,
  expectedRepoCid,
  fetchJson,
  HANDLE,
  OTHER_COLLECTION,
  PDS,
  setupRepo,
} from "./support.ts";

type ApplyWritesResult =
  | {
      $type: "com.atproto.repo.applyWrites#createResult";
      uri: string;
      cid: string;
    }
  | {
      $type: "com.atproto.repo.applyWrites#updateResult";
      uri: string;
      cid: string;
    }
  | { $type: "com.atproto.repo.applyWrites#deleteResult" };

type ApplyWritesBody = { results: ApplyWritesResult[] };

const applyWrites = (repo: string, writes: Array<Record<string, unknown>>) =>
  fetchJson<ApplyWritesBody>(`${PDS}/xrpc/com.atproto.repo.applyWrites`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, writes }),
  });

describe("applyWrites", () => {
  it("creates a record from a single #create entry and exposes it through reads", async () => {
    const repo = setupRepo({ did: DID, pds: PDS });
    const value = { text: "hello" };

    const response = await applyWrites(DID, [
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: COLLECTION,
        value,
      },
    ]);

    expect(response.body.results).toHaveLength(1);
    const [result] = response.body.results;
    expect(result).toMatchObject({
      $type: "com.atproto.repo.applyWrites#createResult",
    });
    if (result?.$type !== "com.atproto.repo.applyWrites#createResult") {
      throw new Error("expected createResult");
    }
    const rkey = new AtUri(result.uri).rkey;
    expect(result.cid).toBe(expectedRepoCid(rkey, value));
    expect(repo.records()).toEqual([
      {
        collection: COLLECTION,
        rkey,
        uri: result.uri,
        cid: result.cid,
        value,
      },
    ]);
  });

  it("honors an explicit rkey on #create", async () => {
    setupRepo({ did: DID, pds: PDS });

    const response = await applyWrites(DID, [
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: COLLECTION,
        rkey: "explicit",
        value: { text: "explicit" },
      },
    ]);

    const [result] = response.body.results;
    if (result?.$type !== "com.atproto.repo.applyWrites#createResult") {
      throw new Error("expected createResult");
    }
    expect(result.uri).toBe(`at://${DID}/${COLLECTION}/explicit`);
  });

  it("updates an existing record through #update and overwrites its value", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: { [COLLECTION]: [{ rkey: "seeded", value: { text: "old" } }] },
    });

    const response = await applyWrites(DID, [
      {
        $type: "com.atproto.repo.applyWrites#update",
        collection: COLLECTION,
        rkey: "seeded",
        value: { text: "new" },
      },
    ]);

    const [result] = response.body.results;
    expect(result).toEqual({
      $type: "com.atproto.repo.applyWrites#updateResult",
      uri: `at://${DID}/${COLLECTION}/seeded`,
      cid: expectedRepoCid("seeded", { text: "new" }),
    });
    expect(repo.records()).toEqual([
      {
        collection: COLLECTION,
        rkey: "seeded",
        uri: `at://${DID}/${COLLECTION}/seeded`,
        cid: expectedRepoCid("seeded", { text: "new" }),
        value: { text: "new" },
      },
    ]);
  });

  it("removes a record through #delete and returns deleteResult", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: { [COLLECTION]: [{ rkey: "seeded", value: { text: "old" } }] },
    });

    const response = await applyWrites(DID, [
      {
        $type: "com.atproto.repo.applyWrites#delete",
        collection: COLLECTION,
        rkey: "seeded",
      },
    ]);

    expect(response.body.results).toEqual([
      { $type: "com.atproto.repo.applyWrites#deleteResult" },
    ]);
    expect(repo.records()).toEqual([]);
  });

  it("applies a mixed batch (create + update + delete) in order and reports results in matching order", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [
          { rkey: "to-update", value: { text: "old" } },
          { rkey: "to-delete", value: { text: "doomed" } },
        ],
      },
    });

    const response = await applyWrites(DID, [
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: OTHER_COLLECTION,
        rkey: "new",
        value: { text: "fresh" },
      },
      {
        $type: "com.atproto.repo.applyWrites#update",
        collection: COLLECTION,
        rkey: "to-update",
        value: { text: "updated" },
      },
      {
        $type: "com.atproto.repo.applyWrites#delete",
        collection: COLLECTION,
        rkey: "to-delete",
      },
    ]);

    expect(response.body.results.map((r) => r.$type)).toEqual([
      "com.atproto.repo.applyWrites#createResult",
      "com.atproto.repo.applyWrites#updateResult",
      "com.atproto.repo.applyWrites#deleteResult",
    ]);
    const remainingKeys = repo
      .records()
      .map(
        (r: { collection: string; rkey: string }) =>
          `${r.collection}/${r.rkey}`,
      )
      .sort();
    expect(remainingKeys).toEqual(
      [`${COLLECTION}/to-update`, `${OTHER_COLLECTION}/new`].sort(),
    );
  });

  it("captures every applyWrites entry as a write or delete on the repo log", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: { [COLLECTION]: [{ rkey: "stay", value: {} }] },
    });

    await applyWrites(DID, [
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: COLLECTION,
        rkey: "added",
        value: { text: "added" },
      },
      {
        $type: "com.atproto.repo.applyWrites#delete",
        collection: COLLECTION,
        rkey: "stay",
      },
    ]);

    expect(repo.writes()).toEqual([
      {
        action: "create",
        uri: `at://${DID}/${COLLECTION}/added`,
        cid: expectedRepoCid("added", { text: "added" }),
        record: { text: "added" },
      },
    ]);
    expect(repo.deletes()).toEqual([{ uri: `at://${DID}/${COLLECTION}/stay` }]);
  });

  it("accepts handle as repo identifier", async () => {
    setupRepo({ did: DID, handle: HANDLE, pds: PDS });

    const response = await applyWrites(HANDLE, [
      {
        $type: "com.atproto.repo.applyWrites#create",
        collection: COLLECTION,
        rkey: "via-handle",
        value: { text: "by handle" },
      },
    ]);

    const [result] = response.body.results;
    if (result?.$type !== "com.atproto.repo.applyWrites#createResult") {
      throw new Error("expected createResult");
    }
    expect(result.uri).toBe(`at://${DID}/${COLLECTION}/via-handle`);
  });
});
