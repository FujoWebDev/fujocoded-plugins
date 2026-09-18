import {
  AtUri,
  type ComAtprotoRepoGetRecord,
  type ComAtprotoRepoListRecords,
} from "@atproto/api";
import type { DidString, HandleString } from "@atproto/syntax";

import type { AtProtoCache } from "../cache/index.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordContext,
  RecordValue,
} from "../types.ts";
import { getErrorMessage } from "../utils.ts";
import { getClient, getPds } from "./identity.ts";

export const isRecordValue = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toRecordContext = async (
  source: AtProtoLoaderSource<unknown>,
  record: { uri: string; cid?: string },
  caches: AtProtoCache,
): Promise<AtProtoRecordContext> => {
  const aturi = new AtUri(record.uri);
  if (!aturi.rkey) {
    throw new Error(`Unexpected AtProto record URI: ${record.uri}`);
  }

  // The repo's DID is the AT-URI host. The handle is only known when the
  // source config gave us one, since the loader never makes an extra request
  // to resolve a DID back to its handle.
  const handle = source.repo.startsWith("did:")
    ? undefined
    : (source.repo as HandleString);
  const pds = await getPds(source.repo, caches);

  return {
    repo: { did: aturi.host as DidString, handle, pds },
    collection: source.collection,
    rkey: aturi.rkey,
    uri: record.uri,
    cid: record.cid,
  };
};

/**
 * Run a source's optional `parseRecord` over a record value. It it throws, 
 * leave the expected resolution to the parent cller.
 */
export const parseRecordValue = ({
  source,
  context,
  value,
}: {
  source: AtProtoLoaderSource<unknown>;
  context: AtProtoRecordContext;
  value: unknown;
}): { ok: true; value: unknown } | { ok: false } => {
  if (!source.parseRecord) {
    return { ok: true, value };
  }

  try {
    return { ok: true, value: source.parseRecord(value) };
  } catch (error) {
    console.warn(
      `[atproto-loader] parseRecord threw for ${source.repo}/${source.collection}/${context.rkey}: ${getErrorMessage(error)}`,
    );
    return { ok: false };
  }
};

export const listRecordsPage = async (
  source: AtProtoLoaderSource<unknown>,
  opts: { limit: number; cursor?: string },
  caches: AtProtoCache,
): Promise<ComAtprotoRepoListRecords.Response["data"]> => {
  const client = await getClient(source.repo, caches);
  const { data } = await client.com.atproto.repo.listRecords({
    repo: source.repo,
    collection: source.collection,
    limit: opts.limit,
    cursor: opts.cursor,
  });
  return data;
};

export const getSingleRecord = async (
  source: AtProtoLoaderSource<unknown>,
  rkey: string,
  caches: AtProtoCache,
): Promise<ComAtprotoRepoGetRecord.Response["data"]> => {
  const client = await getClient(source.repo, caches);
  const { data } = await client.com.atproto.repo.getRecord({
    repo: source.repo,
    collection: source.collection,
    rkey,
  });
  return data;
};
