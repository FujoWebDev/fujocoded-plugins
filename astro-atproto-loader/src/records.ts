import {
  AtUri,
  type ComAtprotoRepoGetRecord,
  type ComAtprotoRepoListRecords,
} from "@atproto/api";
import type { AtUriString, DidString } from "@atproto/syntax";
import { getClient } from "./atproto-client.ts";

export type RecordValue = ComAtprotoRepoListRecords.Record["value"];
export type MaybePromise<T> = T | Promise<T>;

export interface AtProtoLoaderSource {
  /**
   * The repo whose records should be loaded. This may be either a DID or a handle.
   */
  repo: string;
  /**
   * The AtProto collection NSID to read from, like `app.bsky.feed.post`.
   */
  collection: string;
  /**
   * Maximum number of entries to load from this source. When omitted, every
   * record is loaded across as many `listRecords` pages as needed. Records
   * rejected by `filter` do not count toward the limit.
   */
  limit?: number;
}

export interface AtProtoRecordContext {
  repo: string;
  collection: string;
  did: DidString;
  rkey: string;
  uri: AtUriString;
  cid?: string;
}

export interface AtProtoRecordCallbackArgs extends AtProtoRecordContext {
  value: RecordValue;
}

export interface AtProtoRecordFilterOptions {
  /**
   * Skip records before they are transformed into Astro entries.
   */
  filter?: (args: AtProtoRecordCallbackArgs) => MaybePromise<boolean>;
}

export type AtProtoRecordTransform<TEntry> = (
  args: AtProtoRecordCallbackArgs,
) => MaybePromise<TEntry>;

export interface AtProtoRecordCallbacks<TEntry>
  extends AtProtoRecordFilterOptions {
  /**
   * Convert a raw AtProto record into an Astro entry.
   */
  transform: AtProtoRecordTransform<TEntry>;
}

const DEFAULT_PAGE_SIZE = 100;

const isRecordValue = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toRecordContext = (
  source: AtProtoLoaderSource,
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

const toRecordCallbackArgs = (
  value: RecordValue,
  context: AtProtoRecordContext,
): AtProtoRecordCallbackArgs => ({
  value,
  ...context,
});

export const defaultTransform = <TData extends Record<string, unknown>>({
  value,
  rkey,
}: AtProtoRecordCallbackArgs): { id: string; data: TData } => ({
  id: rkey,
  data: value as TData,
});

export const fetchAllFromPds = async <TEntry extends { id: string }>(
  source: AtProtoLoaderSource,
  options: AtProtoRecordCallbacks<TEntry>,
): Promise<TEntry[]> => {
  const client = await getClient(source.repo);
  const entries: TEntry[] = [];
  const { limit } = source;
  let cursor: string | undefined;

  do {
    if (limit !== undefined && entries.length >= limit) {
      break;
    }

    const remaining = limit !== undefined ? limit - entries.length : undefined;
    const pageSize =
      remaining !== undefined
        ? Math.min(remaining, DEFAULT_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const { data } = await client.com.atproto.repo.listRecords({
      repo: source.repo,
      collection: source.collection,
      limit: pageSize,
      cursor,
    });

    for (const record of data.records) {
      if (!isRecordValue(record.value)) {
        continue;
      }

      const context = toRecordContext(source, record);
      const args = toRecordCallbackArgs(record.value, context);
      if (options.filter && !(await options.filter(args))) {
        continue;
      }

      entries.push(await options.transform(args));

      if (limit !== undefined && entries.length >= limit) {
        break;
      }
    }

    cursor = data.cursor;
  } while (cursor);

  return entries;
};

export const fetchSingleFromPds = async <TEntry>(
  source: AtProtoLoaderSource,
  options: AtProtoRecordCallbacks<TEntry>,
  rkey: string,
): Promise<TEntry> => {
  const client = await getClient(source.repo);
  const { data }: ComAtprotoRepoGetRecord.Response =
    await client.com.atproto.repo.getRecord({
      repo: source.repo,
      collection: source.collection,
      rkey,
    });

  if (!isRecordValue(data.value)) {
    throw new Error(
      `AtProto record ${source.collection}/${rkey} did not contain an object value`,
    );
  }

  const context = toRecordContext(source, data);
  return options.transform(toRecordCallbackArgs(data.value, context));
};
