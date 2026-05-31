import { AtUri } from "@atproto/syntax";

import { cidForRecord, fakeCid } from "../cid.ts";
import type { MockAtprotoBlob, MockAtprotoRecord } from "./index.ts";

type RepoWrite = {
  action: "create" | "put";
  uri: string;
  cid: string;
  record: Record<string, unknown>;
};

type RepoDelete = {
  uri: string;
};

type StoredAtprotoRecord = {
  uri: AtUri;
  cid: string;
  value: Record<string, unknown>;
  createdAtOrdinal: number;
};

type RecordUriParts = {
  repo: string;
  collection: string;
  rkey?: string;
};

type RecordUriInput = string | AtUri | RecordUriParts;

const GENERATED_RKEY_PREFIX = "3kgenerated";

const byCreatedAtOrdinal = (
  left: StoredAtprotoRecord,
  right: StoredAtprotoRecord,
) => left.createdAtOrdinal - right.createdAtOrdinal;

const toAtUri = (input: RecordUriInput): AtUri =>
  input instanceof AtUri
    ? input
    : typeof input === "string"
      ? new AtUri(input)
      : AtUri.make(input.repo, input.collection, input.rkey);

const createBlobStore = ({ blobs = [] }: { blobs?: MockAtprotoBlob[] }) => {
  const blobStore = new Map<string, { body: BodyInit; contentType: string }>();

  const seedBlob = ({
    cid,
    body = new Uint8Array(),
    contentType = "application/octet-stream",
  }: MockAtprotoBlob) => {
    blobStore.set(cid, { body, contentType });
  };

  for (const blob of blobs) {
    seedBlob(blob);
  }

  return {
    clear: () => blobStore.clear(),
    getBlob: (cid: string) => blobStore.get(cid),
    hasBlob: ({
      did,
      expectedDid,
      cid,
    }: {
      did: string;
      expectedDid: string;
      cid: string;
    }) => did === expectedDid && blobStore.has(cid),
    seedBlob,
  };
};

const createRecordStore = ({ did }: { did: string }) => {
  const records = new Map<string, StoredAtprotoRecord>();
  const declaredCollections = new Set<string>();
  let ordinal = 0;
  let generatedRkey = 0;

  const writeRecord = ({
    uri,
    value,
    cid,
  }: {
    uri: AtUri;
    value: Record<string, unknown>;
    cid?: string;
  }) => {
    const key = uri.toString();
    const existing = records.get(key);
    declaredCollections.add(uri.collection);
    const data: StoredAtprotoRecord = {
      uri,
      cid:
        cid ??
        cidForRecord({
          repo: uri.host,
          collection: uri.collection,
          rkey: uri.rkey,
          value,
        }),
      value,
      createdAtOrdinal: existing?.createdAtOrdinal ?? ordinal++,
    };
    records.set(key, data);
    return data;
  };

  return {
    clear() {
      records.clear();
      declaredCollections.clear();
      ordinal = 0;
      generatedRkey = 0;
    },
    delete: (uri: AtUri) => {
      records.delete(uri.toString());
      return uri;
    },
    find: (uri: AtUri) => {
      if (!declaredCollections.has(uri.collection)) return;
      return records.get(uri.toString());
    },
    hasCollection: (collection: string) => declaredCollections.has(collection),
    listAll: () => Array.from(records.values()).sort(byCreatedAtOrdinal),
    listIn: (collection: string) => {
      if (!declaredCollections.has(collection)) return null;
      return Array.from(records.values())
        .filter((record) => record.uri.collection === collection)
        .sort(byCreatedAtOrdinal);
    },
    nextGeneratedRkey: () => `${GENERATED_RKEY_PREFIX}${++generatedRkey}`,
    seed: (collection: string, entries: MockAtprotoRecord[]) => {
      declaredCollections.add(collection);
      for (const entry of entries) {
        writeRecord({
          uri: AtUri.make(did, collection, entry.rkey),
          value: entry.value,
          cid: entry.cid,
        });
      }
    },
    writeRecord,
  };
};

type RecordStore = ReturnType<typeof createRecordStore>;
type BlobStore = ReturnType<typeof createBlobStore>;

const createLifecycleApi = ({
  recordStore,
  blobStore,
  writes,
  deletes,
}: {
  recordStore: RecordStore;
  blobStore: BlobStore;
  writes: RepoWrite[];
  deletes: RepoDelete[];
}) => ({
  clear() {
    recordStore.clear();
    blobStore.clear();
    writes.splice(0);
    deletes.splice(0);
  },
  currentRecords: () =>
    recordStore.listAll().map((record) => ({
      collection: record.uri.collection,
      rkey: record.uri.rkey,
      uri: record.uri.toString(),
      cid: record.cid,
      value: record.value,
    })),
  currentWrites: () => writes.map((write) => ({ ...write })),
  currentDeletes: () => deletes.map((deleted) => ({ ...deleted })),
});

const createRecordApi = ({
  did,
  recordStore,
  writes,
  deletes,
  handle,
}: {
  did: string;
  recordStore: RecordStore;
  writes: RepoWrite[];
  deletes: RepoDelete[];
  handle?: string;
}) => {
  const hasRepo = (repo: string) => repo === did || repo === handle;

  const normalizeRecordUri = (
    input: RecordUriInput,
    { generateRkey = false }: { generateRkey?: boolean } = {},
  ): AtUri | undefined => {
    try {
      const uri = toAtUri(input);
      if (!hasRepo(uri.host) || !uri.collection) return;
      const rkey =
        uri.rkey || (generateRkey ? recordStore.nextGeneratedRkey() : "");
      if (!rkey) return;
      return AtUri.make(did, uri.collection, rkey);
    } catch {
      return;
    }
  };

  return {
    hasRepo,
    hasCollection: ({
      repo,
      collection,
    }: {
      repo: string;
      collection: string;
    }) => hasRepo(repo) && recordStore.hasCollection(collection),
    nextGeneratedRkey: recordStore.nextGeneratedRkey,
    seed: recordStore.seed,
    findRecord(uri: RecordUriInput) {
      const recordUri = normalizeRecordUri(uri);
      if (!recordUri) return;
      const record = recordStore.find(recordUri);
      return record
        ? {
            uri: record.uri.toString(),
            cid: record.cid,
            value: record.value,
          }
        : undefined;
    },
    recordsFor({ repo, collection }: { repo: string; collection: string }) {
      if (!hasRepo(repo)) return null;
      const list = recordStore.listIn(collection);
      return list
        ? list.map((record) => ({
            uri: record.uri.toString(),
            cid: record.cid,
            value: record.value,
          }))
        : null;
    },
    writeRecord({
      action,
      uri,
      record,
    }: {
      action: RepoWrite["action"];
      uri: RecordUriInput;
      record: Record<string, unknown>;
    }) {
      const recordUri = normalizeRecordUri(uri, { generateRkey: true });
      if (!recordUri) {
        throw new Error("Cannot write a record for an unknown repo or URI");
      }
      const stored = recordStore.writeRecord({ uri: recordUri, value: record });
      const uriString = stored.uri.toString();
      writes.push({ action, uri: uriString, cid: stored.cid, record });
      return { uri: uriString, cid: stored.cid };
    },
    deleteRecord(input: RecordUriInput) {
      const recordUri = normalizeRecordUri(input);
      if (!recordUri) return;
      const uri = recordStore.delete(recordUri);
      deletes.push({ uri: uri.toString() });
    },
  };
};

const bodyToString = (body: BodyInit): string => {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("base64");
  if (body instanceof ArrayBuffer)
    return Buffer.from(new Uint8Array(body)).toString("base64");
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString(
      "base64",
    );
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error(
    "Cannot derive a stable blob CID from a Blob, FormData, or stream body. Pass an explicit `cid` when seeding this blob.",
  );
};

const createBlobApi = ({
  did,
  blobStore,
}: {
  did: string;
  blobStore: BlobStore;
}) => ({
  getBlob: blobStore.getBlob,
  hasBlob: ({ did: requestDid, cid }: { did: string; cid: string }) =>
    blobStore.hasBlob({ did: requestDid, expectedDid: did, cid }),
  seedBlob: blobStore.seedBlob,
  addBlob: ({
    body,
    contentType = "application/octet-stream",
  }: {
    body: BodyInit;
    contentType?: string;
  }) => {
    const cid = fakeCid(`blob:${contentType}:${bodyToString(body)}`);
    blobStore.seedBlob({ cid, body, contentType });
    return { cid };
  },
});

export const createRepoModel = ({
  did,
  handle,
  records = {},
  blobs = [],
}: {
  did: string;
  handle?: string;
  records?: Record<string, MockAtprotoRecord[]>;
  blobs?: MockAtprotoBlob[];
}) => {
  const recordStore = createRecordStore({ did });
  const blobStore = createBlobStore({ blobs });
  const writes: RepoWrite[] = [];
  const deletes: RepoDelete[] = [];

  for (const [collection, seedRecords] of Object.entries(records)) {
    recordStore.seed(collection, seedRecords);
  }

  return {
    ...createLifecycleApi({ recordStore, blobStore, writes, deletes }),
    ...createRecordApi({ did, handle, recordStore, writes, deletes }),
    ...createBlobApi({ did, blobStore }),
  };
};
