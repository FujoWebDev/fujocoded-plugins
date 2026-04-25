import {
  AtUri,
  type ComAtprotoRepoGetRecord,
  type ComAtprotoRepoListRecords,
} from "@atproto/api";
import type { AtUriString, DidString } from "@atproto/syntax";

import type {
  AtProtoLoaderSource,
  AtProtoRecordContext,
  RecordValue,
} from "../types.ts";
import { getClient } from "./identity.ts";

export const isRecordValue = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toRecordContext = (
  source: AtProtoLoaderSource<unknown>,
  record: { uri: string; cid?: string },
): AtProtoRecordContext => {
  const aturi = new AtUri(record.uri);
  if (!aturi.rkey) {
    throw new Error(`Unexpected AtProto record URI: ${record.uri}`);
  }

  return {
    repo: source.repo,
    collection: source.collection,
    did: aturi.host as DidString,
    rkey: aturi.rkey,
    uri: record.uri as AtUriString,
    cid: record.cid,
  };
};

export const listRecordsPage = async (
  source: AtProtoLoaderSource<unknown>,
  opts: { limit: number; cursor?: string },
): Promise<ComAtprotoRepoListRecords.Response["data"]> => {
  const client = await getClient(source.repo);
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
): Promise<ComAtprotoRepoGetRecord.Response["data"]> => {
  const client = await getClient(source.repo);
  const { data } = await client.com.atproto.repo.getRecord({
    repo: source.repo,
    collection: source.collection,
    rkey,
  });
  return data;
};
