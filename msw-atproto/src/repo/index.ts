import type { HttpHandler } from "msw";

import { createMutableRepoIdentity } from "../identity/mock.ts";
import { createFailOnceController } from "./failures.ts";
import { createRepoHandlers } from "./handlers.ts";
import { createRepoModel } from "./model.ts";

export type MockAtprotoRecord = {
  rkey: string;
  value: Record<string, unknown>;
  cid?: string;
};

export type MockAtprotoBlob = {
  cid: string;
  body?: BodyInit;
  contentType?: string;
};

/**
 * Options accepted by every `failOnce.*` method.
 *
 * Omit `status` for a `500 InternalServerError`. Pass `status` to pick the
 * default ATproto error body for that HTTP status. For example, `401` becomes
 * `AuthRequired`, `404` on a record becomes `RecordNotFound`, and `5xx`
 * becomes `InternalServerError`.
 *
 * Pass `error` or `message` to override that body. Endpoint-specific fields
 * such as `collection`, `rkey`, or `cid` narrow which request consumes the
 * queued failure.
 */
export type RepoFailureOpts<Fields extends string = never> = {
  status?: number;
  error?: string;
  message?: string;
} & Partial<Record<Fields, string>>;

export type MockAtprotoRepoConfig = {
  did: string;
  pds?: string;
  handle?: string;
  records?: Record<string, MockAtprotoRecord[]>;
  blobs?: MockAtprotoBlob[];
};

/**
 * Builds one stateful fake ATproto account for tests.
 *
 * Use this first when your test reads or writes records through a real client.
 * The returned handlers cover identity resolution, all six record endpoints,
 * and both blob endpoints. Writes update the same in-memory store that later
 * reads use, so a `createRecord` followed by `listRecords` returns the new
 * record.
 */
export const createMockAtprotoRepo = ({
  did,
  pds = "https://pds.fujocoded.test",
  handle,
  records = {},
  blobs = [],
}: MockAtprotoRepoConfig) => {
  const identity = createMutableRepoIdentity({ did, pds, handle });
  const model = createRepoModel({ did, handle, records, blobs });
  const failures = createFailOnceController({ pds });

  return {
    did,
    handle,
    pds,
    identity: identity.controls,

    records: model.currentRecords,
    writes: model.currentWrites,
    deletes: model.currentDeletes,
    seed: model.seed,
    seedBlob: model.seedBlob,
    handlers: () => createRepoHandlers({ did, identity, model, pds, failures }),
    failOnce: {
      listRecords: (config?: RepoFailureOpts<"collection">) =>
        failures.queue("listRecords", config),
      getRecord: (config?: RepoFailureOpts<"collection" | "rkey">) =>
        failures.queue("getRecord", config),
      getBlob: (config?: RepoFailureOpts<"cid">) =>
        failures.queue("getBlob", config),
      createRecord: (config?: RepoFailureOpts<"collection">) =>
        failures.queue("createRecord", config),
      putRecord: (config?: RepoFailureOpts<"collection" | "rkey">) =>
        failures.queue("putRecord", config),
      deleteRecord: (config?: RepoFailureOpts<"collection" | "rkey">) =>
        failures.queue("deleteRecord", config),
    },
    clear() {
      model.clear();
      failures.clear();
    },
  };
};

export const useMockAtprotoRepo = (
  server: { use(...handlers: HttpHandler[]): void },
  config: MockAtprotoRepoConfig,
): ReturnType<typeof createMockAtprotoRepo> => {
  const repo = createMockAtprotoRepo(config);
  server.use(...repo.handlers());
  return repo;
};
