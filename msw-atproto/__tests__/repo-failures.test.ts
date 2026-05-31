import { describe, expect, it } from "vitest";

import { FAKE_CID } from "../src/index.ts";
import {
  COLLECTION,
  DID,
  expectedRepoCid,
  fetchJson,
  OTHER_CID,
  OTHER_COLLECTION,
  PDS,
  setupRepo,
} from "./support.ts";

const listRecordsUrl = (collection = COLLECTION) =>
  `${PDS}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(
    DID,
  )}&collection=${collection}`;

const getRecordUrl = (collection = COLLECTION, rkey = "seeded") =>
  `${PDS}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(
    DID,
  )}&collection=${collection}&rkey=${rkey}`;

const getBlobUrl = (cid = FAKE_CID) =>
  `${PDS}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    DID,
  )}&cid=${cid}`;

const createRecord = (collection = COLLECTION) =>
  fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: DID,
      collection,
      record:
        collection === COLLECTION
          ? { text: "created" }
          : { subject: "created" },
    }),
  });

const putRecord = (collection = COLLECTION, rkey = "seeded") =>
  fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: DID,
      collection,
      rkey,
      record:
        collection === COLLECTION
          ? { text: "updated" }
          : { subject: "updated" },
    }),
  });

const deleteRecord = (collection = COLLECTION, rkey = "seeded") =>
  fetch(`${PDS}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: DID, collection, rkey }),
  });

const setupFailureRepo = () =>
  setupRepo({
    did: DID,
    pds: PDS,
    records: {
      [COLLECTION]: [{ rkey: "seeded", value: { text: "seeded" } }],
      [OTHER_COLLECTION]: [{ rkey: "like", value: { subject: "seeded" } }],
    },
    blobs: [
      { cid: FAKE_CID, body: new Uint8Array([1]) },
      { cid: OTHER_CID, body: new Uint8Array([2]) },
    ],
  });

describe("failOnce error shapes", () => {
  const failureCases = [
    {
      name: "listRecords returns AuthRequired for 401",
      queue: (repo: ReturnType<typeof setupRepo>) =>
        repo.failOnce.listRecords({ status: 401 }),
      request: () => fetchJson(listRecordsUrl()),
      expected: {
        response: { status: 401 },
        body: { error: "AuthRequired", message: "Authentication required" },
      },
    },
    {
      name: "getRecord returns RecordNotFound for 404",
      queue: (repo: ReturnType<typeof setupRepo>) =>
        repo.failOnce.getRecord({ status: 404 }),
      request: () => fetchJson(getRecordUrl()),
      expected: {
        response: { status: 404 },
        body: { error: "RecordNotFound", message: "Record not found" },
      },
    },
    {
      name: "getBlob returns NotFound for 404",
      queue: (repo: ReturnType<typeof setupRepo>) =>
        repo.failOnce.getBlob({ status: 404 }),
      request: () => fetchJson(getBlobUrl()),
      expected: {
        response: { status: 404 },
        body: { error: "NotFound", message: "Blob not found" },
      },
    },
    {
      name: "createRecord returns RateLimitExceeded for 429",
      queue: (repo: ReturnType<typeof setupRepo>) =>
        repo.failOnce.createRecord({ status: 429 }),
      request: () =>
        fetchJson(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: DID,
            collection: COLLECTION,
            record: { text: "failed create" },
          }),
        }),
      expected: {
        response: { status: 429 },
        body: { error: "RateLimitExceeded", message: "Rate limit exceeded" },
      },
    },
    {
      name: "putRecord returns InternalServerError for 503",
      queue: (repo: ReturnType<typeof setupRepo>) =>
        repo.failOnce.putRecord({ status: 503 }),
      request: () =>
        fetchJson(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: DID,
            collection: COLLECTION,
            rkey: "seeded",
            record: { text: "failed put" },
          }),
        }),
      expected: {
        response: { status: 503 },
        body: {
          error: "InternalServerError",
          message: "Internal server error",
        },
      },
    },
    {
      name: "deleteRecord allows a custom error and message",
      queue: (repo: ReturnType<typeof setupRepo>) =>
        repo.failOnce.deleteRecord({
          status: 418,
          error: "Teapot",
          message: "Short and stout",
        }),
      request: () =>
        fetchJson(`${PDS}/xrpc/com.atproto.repo.deleteRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: DID,
            collection: COLLECTION,
            rkey: "seeded",
          }),
        }),
      expected: {
        response: { status: 418 },
        body: { error: "Teapot", message: "Short and stout" },
      },
    },
  ];

  for (const { name, queue, request, expected } of failureCases) {
    it(name, async () => {
      const repo = setupFailureRepo();
      queue(repo);

      await expect(request()).resolves.toMatchObject(expected);
    });
  }

  it("does not record failed writes in writes(), deletes(), or records()", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [{ rkey: "seeded", value: { text: "seeded" } }],
      },
    });

    repo.failOnce.createRecord({ status: 429 });
    repo.failOnce.putRecord({ status: 503 });
    repo.failOnce.deleteRecord({ status: 418 });

    await createRecord();
    await putRecord();
    await deleteRecord();

    expect(repo.writes()).toEqual([]);
    expect(repo.deletes()).toEqual([]);
    expect(repo.records()).toEqual([
      {
        collection: COLLECTION,
        rkey: "seeded",
        uri: `at://${DID}/${COLLECTION}/seeded`,
        cid: expectedRepoCid("seeded", { text: "seeded" }),
        value: { text: "seeded" },
      },
    ]);
  });

  it("defaults failOnce failures to 500 InternalServerError", async () => {
    const repo = setupFailureRepo();
    repo.failOnce.getRecord();

    const failed = await fetchJson(getRecordUrl());

    expect(failed).toMatchObject({
      response: { status: 500 },
      body: {
        error: "InternalServerError",
        message: "Internal server error",
      },
    });
  });
});

describe("failOnce filters", () => {
  it("filters by collection", async () => {
    const repo = setupFailureRepo();

    repo.failOnce.listRecords({ collection: OTHER_COLLECTION });
    repo.failOnce.createRecord({ collection: OTHER_COLLECTION });

    const listPost = await fetch(listRecordsUrl());
    const listLike = await fetch(listRecordsUrl(OTHER_COLLECTION));
    const createPost = await createRecord();
    const createLike = await createRecord(OTHER_COLLECTION);

    expect(listPost.status).toBe(200);
    expect(listLike.status).toBe(500);
    expect(createPost.status).toBe(200);
    expect(createLike.status).toBe(500);
  });

  it("filters by rkey", async () => {
    const repo = setupRepo({
      did: DID,
      pds: PDS,
      records: {
        [COLLECTION]: [
          { rkey: "post", value: { text: "post" } },
          { rkey: "other", value: { text: "other" } },
        ],
      },
    });

    repo.failOnce.getRecord({ rkey: "post" });
    repo.failOnce.putRecord({ rkey: "post" });
    repo.failOnce.deleteRecord({ rkey: "post" });

    const getOther = await fetch(getRecordUrl(COLLECTION, "other"));
    const getPost = await fetch(getRecordUrl(COLLECTION, "post"));
    const putOther = await putRecord(COLLECTION, "other");
    const putPost = await putRecord(COLLECTION, "post");
    const deleteOther = await deleteRecord(COLLECTION, "other");
    const deletePost = await deleteRecord(COLLECTION, "post");

    expect(getOther.status).toBe(200);
    expect(getPost.status).toBe(500);
    expect(putOther.status).toBe(200);
    expect(putPost.status).toBe(500);
    expect(deleteOther.status).toBe(200);
    expect(deletePost.status).toBe(500);
  });

  it("filters getBlob by cid", async () => {
    const repo = setupFailureRepo();

    repo.failOnce.getBlob({ cid: OTHER_CID });

    const defaultBlob = await fetch(getBlobUrl());
    const otherBlob = await fetch(getBlobUrl(OTHER_CID));

    expect(defaultBlob.status).toBe(200);
    expect(otherBlob.status).toBe(500);
  });
});

describe("failOnce consumption", () => {
  it("clears queued failOnce failures", async () => {
    const repo = setupRepo({ did: DID, pds: PDS });
    repo.failOnce.createRecord({ status: 500 });

    repo.clear();
    const afterClear = await createRecord();

    expect(afterClear.status).toBe(200);
  });

  it("consumes at request entry so only one concurrent match fails", async () => {
    const repo = setupFailureRepo();
    repo.failOnce.getRecord({ status: 500 });

    const responses = await Promise.all([
      fetch(getRecordUrl()),
      fetch(getRecordUrl()),
    ]);

    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 500]);
  });
});
