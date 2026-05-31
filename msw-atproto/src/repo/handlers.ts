import { HttpResponse, type HttpHandler } from "msw";

import type { createMutableRepoIdentity } from "../identity/mock.ts";
import type { FailOnceController } from "./failures.ts";
import { matchesFields } from "./failures.ts";
import type { createRepoModel } from "./model.ts";
import { defineXrpcRoute, readXrpcJsonBody } from "./xrpc.ts";

type MutableRepoIdentity = ReturnType<typeof createMutableRepoIdentity>;
type RepoModel = ReturnType<typeof createRepoModel>;

type WriteRecordBody = {
  collection: string;
  record: Record<string, unknown>;
  repo: string;
  rkey?: string;
};

type DeleteRecordBody = {
  collection: string;
  repo: string;
  rkey: string;
};

type ApplyWriteCreate = {
  $type: "com.atproto.repo.applyWrites#create";
  collection: string;
  rkey?: string;
  value: Record<string, unknown>;
};

type ApplyWriteUpdate = {
  $type: "com.atproto.repo.applyWrites#update";
  collection: string;
  rkey: string;
  value: Record<string, unknown>;
};

type ApplyWriteDelete = {
  $type: "com.atproto.repo.applyWrites#delete";
  collection: string;
  rkey: string;
};

type ApplyWriteEntry = ApplyWriteCreate | ApplyWriteUpdate | ApplyWriteDelete;

type ApplyWritesBody = {
  repo: string;
  writes: ApplyWriteEntry[];
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asRecordObject = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const parseWriteRecordBody = ({
  body,
  requiresRkey,
}: {
  body: Record<string, unknown> | undefined;
  requiresRkey: boolean;
}): WriteRecordBody | undefined => {
  const repo = asString(body?.repo);
  const collection = asString(body?.collection);
  const rkey = asString(body?.rkey);
  const record = asRecordObject(body?.record);

  if (!repo || !collection || !record) return;
  if (body?.rkey !== undefined && rkey === undefined) return;
  if (requiresRkey && !rkey) return;

  return {
    repo,
    collection,
    record: { ...record },
    ...(rkey !== undefined && { rkey }),
  };
};

const parseDeleteRecordBody = (
  body: Record<string, unknown> | undefined,
): DeleteRecordBody | undefined => {
  const repo = asString(body?.repo);
  const collection = asString(body?.collection);
  const rkey = asString(body?.rkey);
  if (!repo || !collection || !rkey) return;
  return { repo, collection, rkey };
};

const APPLY_WRITES_TYPES = {
  create: "com.atproto.repo.applyWrites#create",
  update: "com.atproto.repo.applyWrites#update",
  delete: "com.atproto.repo.applyWrites#delete",
} as const;

const parseApplyWriteEntry = (entry: unknown): ApplyWriteEntry | undefined => {
  const obj = asRecordObject(entry);
  if (!obj) return;

  const type = asString(obj.$type);
  const collection = asString(obj.collection);
  if (!type || !collection) return;

  const rkey = asString(obj.rkey);
  const value = asRecordObject(obj.value);

  if (type === APPLY_WRITES_TYPES.create) {
    if (!value) return;
    return {
      $type: type,
      collection,
      value,
      ...(rkey !== undefined && { rkey }),
    };
  }

  if (type === APPLY_WRITES_TYPES.update) {
    if (!rkey || !value) return;
    return { $type: type, collection, rkey, value };
  }

  if (type === APPLY_WRITES_TYPES.delete) {
    if (!rkey) return;
    return { $type: type, collection, rkey };
  }

  return;
};

const parseApplyWritesBody = (
  body: Record<string, unknown> | undefined,
): ApplyWritesBody | undefined => {
  const repo = asString(body?.repo);
  if (!repo || !Array.isArray(body?.writes)) return;

  const writes: ApplyWriteEntry[] = [];
  for (const raw of body.writes) {
    const entry = parseApplyWriteEntry(raw);
    if (!entry) return;
    writes.push(entry);
  }

  return { repo, writes };
};

const readMatchingBody = async ({
  model,
  request,
}: {
  model: RepoModel;
  request: Request;
}) => {
  const body = await readXrpcJsonBody(request);
  return typeof body?.repo === "string" && model.hasRepo(body.repo)
    ? body
    : undefined;
};

const listRecordsHandler = ({
  pds,
  model,
}: {
  pds: string;
  model: RepoModel;
}): HttpHandler =>
  defineXrpcRoute({
    pds,
    method: "com.atproto.repo.listRecords",
    matches({ url }) {
      const repo = url.searchParams.get("repo");
      const collection = url.searchParams.get("collection");
      return (
        repo !== null &&
        collection !== null &&
        model.hasCollection({ repo, collection })
      );
    },
    resolve({ url }) {
      const repo = url.searchParams.get("repo")!;
      const collection = url.searchParams.get("collection")!;
      const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
      const offset = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
      const records = model.recordsFor({ repo, collection }) ?? [];
      const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
      const page = records.slice(safeOffset, safeOffset + limit);
      const nextOffset = safeOffset + limit;

      return HttpResponse.json({
        records: page,
        ...(nextOffset < records.length && { cursor: String(nextOffset) }),
      });
    },
  });

const getRecordHandler = ({
  pds,
  model,
}: {
  pds: string;
  model: RepoModel;
}): HttpHandler =>
  defineXrpcRoute({
    pds,
    method: "com.atproto.repo.getRecord",
    matches({ url }) {
      const repo = url.searchParams.get("repo");
      const collection = url.searchParams.get("collection");
      const rkey = url.searchParams.get("rkey");
      return (
        repo !== null &&
        collection !== null &&
        rkey !== null &&
        model.hasCollection({ repo, collection })
      );
    },
    resolve({ url }) {
      const record = model.findRecord({
        repo: url.searchParams.get("repo")!,
        collection: url.searchParams.get("collection")!,
        rkey: url.searchParams.get("rkey")!,
      });

      return record
        ? HttpResponse.json(record)
        : HttpResponse.json(
            { error: "RecordNotFound", message: "Record not found" },
            { status: 404 },
          );
    },
  });

const getBlobHandler = ({
  pds,
  model,
}: {
  pds: string;
  model: RepoModel;
}): HttpHandler =>
  defineXrpcRoute({
    pds,
    method: "com.atproto.sync.getBlob",
    matches({ url }) {
      const did = url.searchParams.get("did");
      const cid = url.searchParams.get("cid");
      if (!did || !cid) {
        return false;
      }

      return model.hasBlob({ did, cid });
    },
    resolve({ url }) {
      const blob = model.getBlob(url.searchParams.get("cid")!);
      return blob
        ? new HttpResponse(blob.body, {
            headers: { "content-type": blob.contentType },
          })
        : HttpResponse.json(
            { error: "NotFound", message: "Blob not found" },
            { status: 404 },
          );
    },
  });

const writeRecordHandler = ({
  pds,
  model,
  method,
  action,
  requiresRkey,
}: {
  pds: string;
  model: RepoModel;
  method: "com.atproto.repo.createRecord" | "com.atproto.repo.putRecord";
  action: "create" | "put";
  requiresRkey: boolean;
}): HttpHandler =>
  defineXrpcRoute<WriteRecordBody>({
    pds,
    method,
    httpMethod: "post",
    async matches(context) {
      const body = await readXrpcJsonBody(context.request);
      const write = parseWriteRecordBody({ body, requiresRkey });
      context.parsed = write;
      return write !== undefined && model.hasRepo(write.repo);
    },
    resolve({ parsed }) {
      if (!parsed) {
        throw new Error(`Matched ${method} request is missing a valid body`);
      }

      return HttpResponse.json(
        model.writeRecord({
          action,
          uri: {
            repo: parsed.repo,
            collection: parsed.collection,
            rkey: parsed.rkey,
          },
          record: parsed.record,
        }),
      );
    },
  });

const deleteRecordHandler = ({
  pds,
  model,
}: {
  pds: string;
  model: RepoModel;
}): HttpHandler =>
  defineXrpcRoute<DeleteRecordBody>({
    pds,
    method: "com.atproto.repo.deleteRecord",
    httpMethod: "post",
    async matches(context) {
      const body = await readXrpcJsonBody(context.request);
      const deletion = parseDeleteRecordBody(body);

      context.parsed = deletion;
      return (
        deletion !== undefined &&
        model.hasCollection({
          repo: deletion.repo,
          collection: deletion.collection,
        })
      );
    },
    resolve({ parsed }) {
      if (!parsed) {
        throw new Error(
          "Matched com.atproto.repo.deleteRecord request is missing a valid body",
        );
      }

      model.deleteRecord(parsed);

      return HttpResponse.json({});
    },
  });

const applyWritesHandler = ({
  pds,
  model,
}: {
  pds: string;
  model: RepoModel;
}): HttpHandler =>
  defineXrpcRoute<ApplyWritesBody>({
    pds,
    method: "com.atproto.repo.applyWrites",
    httpMethod: "post",
    async matches(context) {
      const body = await readXrpcJsonBody(context.request);
      const parsed = parseApplyWritesBody(body);
      context.parsed = parsed;
      return parsed !== undefined && model.hasRepo(parsed.repo);
    },
    resolve({ parsed }) {
      if (!parsed) {
        throw new Error(
          "Matched com.atproto.repo.applyWrites request is missing a valid body",
        );
      }

      const results = parsed.writes.map((entry) => {
        if (entry.$type === APPLY_WRITES_TYPES.delete) {
          model.deleteRecord({
            repo: parsed.repo,
            collection: entry.collection,
            rkey: entry.rkey,
          });
          return { $type: "com.atproto.repo.applyWrites#deleteResult" };
        }

        const action =
          entry.$type === APPLY_WRITES_TYPES.create ? "create" : "put";
        const { uri, cid } = model.writeRecord({
          action,
          uri: {
            repo: parsed.repo,
            collection: entry.collection,
            ...(entry.rkey !== undefined && { rkey: entry.rkey }),
          },
          record: entry.value,
        });

        return {
          $type:
            action === "create"
              ? "com.atproto.repo.applyWrites#createResult"
              : "com.atproto.repo.applyWrites#updateResult",
          uri,
          cid,
        };
      });

      return HttpResponse.json({ results });
    },
  });

const uploadBlobHandler = ({
  pds,
  model,
}: {
  pds: string;
  model: RepoModel;
}): HttpHandler =>
  defineXrpcRoute({
    pds,
    method: "com.atproto.repo.uploadBlob",
    httpMethod: "post",
    resolve: async ({ request }) => {
      const contentType =
        request.headers.get("content-type") ?? "application/octet-stream";
      const buffer = new Uint8Array(await request.arrayBuffer());
      const blob = model.addBlob({ body: buffer, contentType });

      return HttpResponse.json({
        blob: {
          $type: "blob",
          ref: { $link: blob.cid },
          mimeType: contentType,
          size: buffer.byteLength,
        },
      });
    },
  });

const createFailureRoutes = ({
  did,
  model,
  failures,
}: {
  did: string;
  model: RepoModel;
  failures: FailOnceController;
}): HttpHandler[] => [
  failures.defineRoute({
    endpoint: "listRecords",
    method: "com.atproto.repo.listRecords",
    matches: ({ url }) => {
      const repo = url.searchParams.get("repo");
      const collection = url.searchParams.get("collection");

      if (repo === null || collection === null || !model.hasRepo(repo)) {
        return;
      }

      return matchesFields({ collection });
    },
  }),
  failures.defineRoute({
    endpoint: "getRecord",
    method: "com.atproto.repo.getRecord",
    matches: ({ url }) => {
      const repo = url.searchParams.get("repo");
      const collection = url.searchParams.get("collection");
      const rkey = url.searchParams.get("rkey");

      if (!repo || !model.hasRepo(repo)) {
        return;
      }

      if (!collection || !rkey) {
        return;
      }

      return matchesFields({ collection, rkey });
    },
  }),
  failures.defineRoute({
    endpoint: "getBlob",
    method: "com.atproto.sync.getBlob",
    matches: ({ url }) => {
      const requestDid = url.searchParams.get("did");
      const cid = url.searchParams.get("cid");

      if (requestDid !== did || !cid) {
        return;
      }

      return matchesFields({ cid });
    },
  }),
  failures.defineRoute({
    endpoint: "createRecord",
    method: "com.atproto.repo.createRecord",
    httpMethod: "post",
    matches: async ({ request }) => {
      const body = await readMatchingBody({ model, request });
      const collection = body?.collection;

      if (typeof collection !== "string") {
        return;
      }

      return matchesFields({ collection });
    },
  }),
  failures.defineRoute({
    endpoint: "putRecord",
    method: "com.atproto.repo.putRecord",
    httpMethod: "post",
    matches: async ({ request }) => {
      const body = await readMatchingBody({ model, request });
      const collection = body?.collection;
      const rkey = body?.rkey;

      if (typeof collection !== "string" || typeof rkey !== "string") {
        return;
      }

      return matchesFields({ collection, rkey });
    },
  }),
  failures.defineRoute({
    endpoint: "deleteRecord",
    method: "com.atproto.repo.deleteRecord",
    httpMethod: "post",
    matches: async ({ request }) => {
      const body = await readMatchingBody({ model, request });
      const collection = body?.collection;
      const rkey = body?.rkey;

      if (typeof collection !== "string" || typeof rkey !== "string") {
        return;
      }

      return matchesFields({ collection, rkey });
    },
  }),
];

export const createRepoHandlers = ({
  did,
  identity,
  model,
  pds,
  failures,
}: {
  did: string;
  identity: MutableRepoIdentity;
  model: RepoModel;
  pds: string;
  failures: FailOnceController;
}): HttpHandler[] => [
  ...identity.handlers(),
  // Failure routes must precede success handlers: MSW matches first-to-last, and a
  // success handler that responds will prevent the failure route from consuming a queued failOnce.
  ...createFailureRoutes({ did, model, failures }),
  listRecordsHandler({ pds, model }),
  getRecordHandler({ pds, model }),
  getBlobHandler({ pds, model }),
  writeRecordHandler({
    pds,
    model,
    method: "com.atproto.repo.createRecord",
    action: "create",
    requiresRkey: false,
  }),
  writeRecordHandler({
    pds,
    model,
    method: "com.atproto.repo.putRecord",
    action: "put",
    requiresRkey: true,
  }),
  deleteRecordHandler({ pds, model }),
  applyWritesHandler({ pds, model }),
  uploadBlobHandler({ pds, model }),
];
