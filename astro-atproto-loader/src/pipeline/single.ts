import {
  getSingleRecord,
  isRecordValue,
  toRecordContext,
} from "../client/records.ts";
import type {
  ArgsUnion,
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordCallbacks,
} from "../types.ts";
import { getErrorMessage } from "../utils.ts";
import { createFetchRecord } from "./fetch-record.ts";

/**
 * Fetch and process a single record for the live loader's `loadEntry` path.
 *
 * Used when we know the exact rkey for a request and don't want to walk the
 * whole cached collection. Creates a fresh per-call `fetchRecord` so
 * callbacks see the same behavior they would inside a normal load cycle.
 *
 * Returns `undefined` if `parseRecord`, `filter`, or `transform` drop the
 * record. Callers should fall back to the cached collection in that case.
 */
export const runSingleFetch = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
>(
  source: AtProtoLoaderSource<unknown>,
  callbacks: AtProtoRecordCallbacks<Sources, Entry>,
  rkey: string,
): Promise<Entry | undefined> => {
  const fetchRecord = createFetchRecord();
  const data = await getSingleRecord(source, rkey);

  if (!isRecordValue(data.value)) {
    throw new Error(
      `AtProto record ${source.collection}/${rkey} did not contain an object value`,
    );
  }

  const context = await toRecordContext(source, data);

  let value: unknown = data.value;
  if (source.parseRecord) {
    try {
      value = source.parseRecord(data.value);
    } catch (error) {
      console.warn(
        `[atproto-loader] parseRecord threw for ${source.repo}/${source.collection}/${context.rkey}: ${getErrorMessage(error)}`,
      );
      return undefined;
    }
  }

  const args: AtProtoRecordCallbackArgs<unknown> = {
    ...context,
    value,
    fetchRecord,
  };

  if (
    callbacks.filter &&
    !(await callbacks.filter(args as ArgsUnion<Sources>))
  ) {
    return undefined;
  }

  let entry: Entry | null | undefined;
  if (callbacks.groupBy) {
    const key = await callbacks.groupBy(args as ArgsUnion<Sources>);
    if (typeof key !== "string") {
      throw new Error(
        `AtProto loader groupBy must return a string key for ${args.repo.handle ?? args.repo.did}/${args.collection}/${args.rkey}`,
      );
    }

    entry = await callbacks.transform({
      key,
      records: [args as ArgsUnion<Sources>],
      fetchRecord,
    });
  } else {
    entry = await callbacks.transform(args as ArgsUnion<Sources>);
  }

  if (entry === null || entry === undefined) {
    console.debug(
      `[atproto-loader] transform dropped entry: ${args.repo.handle ?? args.repo.did}/${args.collection}/${args.rkey}`,
    );
    return undefined;
  }
  return entry;
};
