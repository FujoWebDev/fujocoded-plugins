import {
  getSingleRecord,
  isRecordValue,
  toRecordContext,
} from "../client/records.ts";
import type { AtProtoCache } from "../cache/index.ts";
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
  caches: AtProtoCache,
): Promise<Entry | undefined> => {
  const fetchRecord = createFetchRecord(caches);
  const data = await getSingleRecord(source, rkey, caches);

  if (!isRecordValue(data.value)) {
    throw new Error(
      `AtProto record ${source.collection}/${rkey} did not contain an object value`,
    );
  }

  const context = await toRecordContext(source, data, caches);

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

/** A single-entry request, as resolved from a loader's entry filter. */
export interface EntryLookup {
  requestedId: string | undefined;
  rkey: string | undefined;
  repo: string | undefined;
  collection: string | undefined;
}

/**
 * Try to resolve a single requested entry with direct `getRecord` calls,
 * instead of waiting on the full collection refresh.
 *
 * This is the request-time fast path for `loadEntry`: entry ids are the cannot
 * be inferred from the record (they're the output of the `transform` callback)
 * which means fetching a SINGLE entry by id could require listing and
 * transforming every record in every source.
 *
 * This function tries to avoid that by using the `rkey` and `repo`/`collection`
 * to narrow down the sources that could hold the requested entry, and then
 * calling `getRecord` on each candidate source. The first source that returns
 * a record whose transformed id matches the requested id is returned.
 *
 * When the requested entry is not found, this function returns `undefined` and
 * the caller should fall back to looking inside the cached collection.
 *
 */
export const findEntryViaFetch = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
>(
  sources: readonly AtProtoLoaderSource<unknown>[],
  callbacks: AtProtoRecordCallbacks<Sources, Entry>,
  { requestedId, rkey, repo, collection }: EntryLookup,
  caches: AtProtoCache,
): Promise<Entry | undefined> => {
  if (!rkey) {
    return undefined;
  }

  const candidates = sources.filter(
    (source) =>
      (!repo || source.repo === repo) &&
      (!collection || source.collection === collection),
  );

  const matchesRequestedId = (entry: Entry) =>
    !requestedId || entry.id === requestedId;

  if (!candidates[0]) return undefined;

  if (candidates.length > 1) {
    // `Awaited<Entry>` is just `Entry` here (entries are never thenables),
    // but TS can't reduce it for an unresolved type parameter.
    const results = (await Promise.allSettled(
      candidates.map((source) =>
        runSingleFetch(source, callbacks, rkey, caches),
      ),
    )) as PromiseSettledResult<Entry | undefined>[];

    const match = results.find(
      (result): result is PromiseFulfilledResult<Entry> =>
        result.status === "fulfilled" &&
        result.value !== undefined &&
        matchesRequestedId(result.value),
    );

    return match?.value;
  }

  const entry = await runSingleFetch(candidates[0], callbacks, rkey, caches);
  return entry && matchesRequestedId(entry) ? entry : undefined;
};
