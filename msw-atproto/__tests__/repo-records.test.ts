import { AtUri } from "@atproto/syntax";
import { CID } from "multiformats";
import { describe, expect, it } from "vitest";

import { createMockAtprotoRepo, FAKE_CID } from "../src/index.ts";
import {
  COLLECTION,
  DID,
  expectedRepoCid,
  fetchJson,
  HANDLE,
  OTHER_CID,
  OTHER_COLLECTION,
  PDS,
  setupRepo,
} from "./support.ts";
import { server } from "./msw/server.ts";

type RecordBody = {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
};

type ListRecordsBody = {
  records: RecordBody[];
  cursor?: string;
};

type WriteRecordBody = {
  uri: string;
  cid: string;
};

const listRecordsUrl = (repo = DID, collection = COLLECTION) =>
  `${PDS}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(
    repo,
  )}&collection=${collection}`;

const getRecordUrl = (repo = DID, collection = COLLECTION, rkey = "seeded") =>
  `${PDS}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(
    repo,
  )}&collection=${collection}&rkey=${rkey}`;

const getBlobUrl = (did = DID, cid = FAKE_CID) =>
  `${PDS}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${cid}`;

const createRecord = (
  repo = DID,
  record: Record<string, unknown> = { text: "created" },
  collection = COLLECTION,
) =>
  fetchJson<WriteRecordBody>(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, collection, record }),
  });

const putRecord = (
  repo = DID,
  rkey = "seeded",
  record: Record<string, unknown> = { text: "updated" },
  collection = COLLECTION,
) =>
  fetchJson<WriteRecordBody>(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, collection, rkey, record }),
  });

const deleteRecord = (repo = DID, rkey = "seeded", collection = COLLECTION) =>
  fetch(`${PDS}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, collection, rkey }),
  });

describe("createMockAtprotoRepo record reads", () => {
  it("serves seeded records through listRecords", async () => {
    const value = { text: "hi" };
    setupRepo({
      did: DID,
      handle: HANDLE,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "first", value }],
      },
    });
    const cid = expectedRepoCid("first", value);

    const list = await fetchJson<ListRecordsBody>(listRecordsUrl());

    expect(list.body).toEqual({
      records: [{ uri: `at://${DID}/${COLLECTION}/first`, cid, value }],
    });
    expect(CID.parse(list.body.records[0]!.cid).version).toBe(1);
  });

  it("uses explicit fixture CIDs as-is", async () => {
    const explicitCid =
      "bafkreics4felvw3rnpwriv7avyvb3qdfutobmovlrskpbxshlmjkers6b4";
    setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [
          { rkey: "explicit", value: { text: "fixture" }, cid: explicitCid },
        ],
      },
    });

    const list = await fetchJson<ListRecordsBody>(listRecordsUrl());

    expect(list.body.records).toMatchObject([{ cid: explicitCid }]);
  });

  it("serves seeded records through getRecord", async () => {
    const value = { text: "hi" };
    setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "first", value }],
      },
    });
    const cid = expectedRepoCid("first", value);

    const get = await fetchJson<RecordBody>(
      getRecordUrl(DID, COLLECTION, "first"),
    );

    expect(get.body).toEqual({
      uri: `at://${DID}/${COLLECTION}/first`,
      cid,
      value,
    });
  });

  it("exposes read seeded records through repo.records()", () => {
    const value = { text: "hi" };
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "first", value }],
      },
    });

    const records = repo.records();
    const cid = expectedRepoCid("first", value);

    expect(records).toEqual([
      {
        collection: COLLECTION,
        rkey: "first",
        uri: `at://${DID}/${COLLECTION}/first`,
        cid,
        value,
      },
    ]);
  });
});

describe("stateful writes", () => {
  it("mutates state through createRecord and exposes created records through reads", async () => {
    setupRepo({ did: DID, pds: PDS });
    const value = { text: "created" };

    const create = await createRecord(DID, value);
    const uri = create.body.uri;
    const rkey = new AtUri(uri).rkey;
    const cid = expectedRepoCid(rkey, value);
    const list = await fetchJson<ListRecordsBody>(listRecordsUrl());
    const get = await fetchJson<RecordBody>(
      getRecordUrl(DID, COLLECTION, rkey),
    );

    expect(rkey).toBe("3kgenerated1");
    expect(create.body).toMatchObject({ uri, cid });
    expect(list.body).toMatchObject({ records: [{ uri, cid, value }] });
    expect(get.body).toMatchObject({ uri, cid, value });
  });

  it("captures successful create calls with rkey, uri, and cid", async () => {
    const repo = setupRepo({ did: DID, handle: HANDLE, pds: PDS });

    const created = await createRecord(HANDLE, { text: "created" });
    const createdRkey = new AtUri(created.body.uri).rkey;

    expect(repo.writes()).toEqual([
      {
        action: "create",
        uri: `at://${DID}/${COLLECTION}/${createdRkey}`,
        cid: created.body.cid,
        record: { text: "created" },
      },
    ]);
  });

  it("captures successful put calls and updates records", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "seeded", value: { text: "seeded" } }],
      },
    });

    const put = await putRecord(DID, "seeded", { text: "updated" });

    expect(repo.records()).toEqual([
      {
        collection: COLLECTION,
        rkey: "seeded",
        uri: `at://${DID}/${COLLECTION}/seeded`,
        cid: expectedRepoCid("seeded", { text: "updated" }),
        value: { text: "updated" },
      },
    ]);
    expect(repo.writes()).toEqual([
      {
        action: "put",
        uri: `at://${DID}/${COLLECTION}/seeded`,
        cid: put.body.cid,
        record: { text: "updated" },
      },
    ]);
  });

  it("captures successful delete calls and removes records", async () => {
    const repo = setupRepo({
      did: DID,
      handle: HANDLE,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "seeded", value: { text: "seeded" } }],
      },
    });

    await deleteRecord(HANDLE, "seeded");

    expect(repo.records()).toEqual([]);
    expect(repo.deletes()).toEqual([
      { uri: `at://${DID}/${COLLECTION}/seeded` },
    ]);
  });

  it("preserves listRecords insertion order when putRecord overwrites an existing record", async () => {
    setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [
          { rkey: "first", value: { text: "first version" } },
          { rkey: "second", value: { text: "second" } },
        ],
      },
    });

    await putRecord(DID, "first", { text: "updated first" });
    const listed = await fetchJson<ListRecordsBody>(listRecordsUrl());

    expect(listed.body).toMatchObject({
      records: [
        {
          uri: `at://${DID}/${COLLECTION}/first`,
          value: { text: "updated first" },
        },
        { uri: `at://${DID}/${COLLECTION}/second`, value: { text: "second" } },
      ],
    });
  });
});

describe("DID and handle matching", () => {
  it("matches stateful reads by configured DID or handle", async () => {
    setupRepo({
      did: DID,
      handle: HANDLE,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "seeded", value: { text: "old" } }],
      },
    });

    const listedByHandle = await fetchJson<ListRecordsBody>(
      listRecordsUrl(HANDLE),
    );
    const fetchedByHandle = await fetchJson<RecordBody>(
      getRecordUrl(HANDLE, COLLECTION, "seeded"),
    );

    expect(listedByHandle.body).toMatchObject({
      records: [{ uri: `at://${DID}/${COLLECTION}/seeded` }],
    });
    expect(fetchedByHandle.body).toMatchObject({
      uri: `at://${DID}/${COLLECTION}/seeded`,
      value: { text: "old" },
    });
  });

  it("matches stateful writes by configured DID or handle", async () => {
    setupRepo({
      did: DID,
      handle: HANDLE,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "seeded", value: { text: "old" } }],
      },
    });

    const createdByHandle = await createRecord(HANDLE, { text: "created" });
    const createdByHandleRkey = new AtUri(createdByHandle.body.uri).rkey;
    await putRecord(HANDLE, "seeded", { text: "updated" });
    await deleteRecord(HANDLE, createdByHandleRkey);
    const listedByDid = await fetchJson<ListRecordsBody>(listRecordsUrl(DID));
    const deletedByDid = await fetchJson<RecordBody>(
      getRecordUrl(DID, COLLECTION, createdByHandleRkey),
    );

    expect(createdByHandle.body).toMatchObject({
      uri: `at://${DID}/${COLLECTION}/${createdByHandleRkey}`,
    });
    expect(listedByDid.body).toMatchObject({
      records: [
        { uri: `at://${DID}/${COLLECTION}/seeded`, value: { text: "updated" } },
      ],
    });
    expect(deletedByDid.response.status).toBe(404);
  });
});

describe("repo boundaries", () => {
  it("keeps unknown repos loud", async () => {
    setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "post", value: { text: "hi" } }],
      },
    });

    await expect(
      fetch(listRecordsUrl("did:plc:other", COLLECTION)),
    ).rejects.toThrow();
  });

  it("keeps undeclared collections loud", async () => {
    setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "post", value: { text: "hi" } }],
      },
    });

    await expect(
      fetch(listRecordsUrl(DID, "app.unseeded.collection")),
    ).rejects.toThrow();
  });

  it("allows declared empty collections", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "post", value: { text: "hi" } }],
      },
    });
    repo.seed(OTHER_COLLECTION, []);

    const posts = await fetchJson<ListRecordsBody>(listRecordsUrl());
    const empty = await fetchJson<ListRecordsBody>(
      listRecordsUrl(DID, OTHER_COLLECTION),
    );

    expect(posts.body).toMatchObject({
      records: [{ uri: `at://${DID}/${COLLECTION}/post` }],
    });
    expect(empty.body).toEqual({ records: [] });
  });

  it("routes same-PDS writes to the matching repo fixture", async () => {
    const firstRepo = createMockAtprotoRepo({ did: DID, pds: PDS });
    const secondDid = "did:plc:secondrepo";
    const secondRepo = createMockAtprotoRepo({ did: secondDid, pds: PDS });
    server.use(...firstRepo.handlers(), ...secondRepo.handlers());

    const created = await createRecord(secondDid, { text: "second" });
    const firstList = await fetch(listRecordsUrl(DID)).catch((error) => error);
    const secondList = await fetchJson<ListRecordsBody>(
      listRecordsUrl(secondDid),
    );
    const createdRkey = new AtUri(created.body.uri).rkey;

    expect(created.body).toMatchObject({
      uri: `at://${secondDid}/${COLLECTION}/${createdRkey}`,
    });
    expect(firstList).toBeInstanceOf(Error);
    expect(secondList.body).toMatchObject({
      records: [{ uri: `at://${secondDid}/${COLLECTION}/${createdRkey}` }],
    });
  });
});

describe("clear()", () => {
  it("resets records, writes, and deletes", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "existing", value: { text: "old" } }],
      },
    });

    await putRecord(DID, "existing", { text: "new" });
    await deleteRecord(DID, "existing");
    repo.seed(COLLECTION, [{ rkey: "after-delete", value: { text: "again" } }]);
    repo.clear();

    expect(repo.records()).toEqual([]);
    expect(repo.writes()).toEqual([]);
    expect(repo.deletes()).toEqual([]);
  });

  it("removes declared empty collections", async () => {
    const repo = setupRepo({ did: DID, pds: PDS });
    repo.seed(OTHER_COLLECTION, []);

    const beforeClear = await fetchJson<ListRecordsBody>(
      listRecordsUrl(DID, OTHER_COLLECTION),
    );
    repo.clear();

    await expect(
      fetch(listRecordsUrl(DID, OTHER_COLLECTION)),
    ).rejects.toThrow();
    expect(beforeClear.body).toEqual({ records: [] });
  });

  it("resets generated rkeys", async () => {
    const repo = setupRepo({ did: DID, pds: PDS });
    const beforeClear = await createRecord(DID, { text: "before clear" });
    const beforeClearRkey = new AtUri(beforeClear.body.uri).rkey;

    repo.clear();
    const afterClear = await createRecord(DID, { text: "after clear" });
    const afterClearRkey = new AtUri(afterClear.body.uri).rkey;

    expect(afterClearRkey).toBe(beforeClearRkey);
  });
});

describe("blobs", () => {
  it("serves seeded blobs through getBlob", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    setupRepo({
      did: DID,
      pds: PDS,
      blobs: [{ cid: FAKE_CID, body: bytes, contentType: "image/png" }],
    });

    const response = await fetch(getBlobUrl());

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("supports adding blobs after the repo fixture is created", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const repo = setupRepo({ did: DID, pds: PDS });
    repo.seedBlob({ cid: FAKE_CID, body: bytes, contentType: "image/jpeg" });

    const response = await fetch(getBlobUrl());

    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("keeps blob reads partitioned by repo DID when fakes share one PDS", async () => {
    const firstBlob = new Uint8Array([1]);
    const secondBlob = new Uint8Array([2]);
    const firstRepo = createMockAtprotoRepo({
      did: DID,
      pds: PDS,
      blobs: [{ cid: FAKE_CID, body: firstBlob }],
    });
    const secondDid = "did:plc:secondrepo";
    const secondRepo = createMockAtprotoRepo({
      did: secondDid,
      pds: PDS,
      blobs: [{ cid: OTHER_CID, body: secondBlob }],
    });
    server.use(...firstRepo.handlers(), ...secondRepo.handlers());

    const first = await fetch(getBlobUrl(DID, FAKE_CID));
    const second = await fetch(getBlobUrl(secondDid, OTHER_CID));

    expect(new Uint8Array(await first.arrayBuffer())).toEqual(firstBlob);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(secondBlob);
  });
});
