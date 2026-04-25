import type {
  ArgsUnion,
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordCallbacks,
  AtProtoRecordGroupBy,
  AtProtoRecordGroupTransformArgs,
  OnSourceError,
} from "../types.ts";
import { getErrorMessage } from "../utils.ts";
import { createFetchRecord } from "./fetch-record.ts";
import { fetchFromSource } from "./source.ts";

const dedupeEntries = <Entry extends { id: string }>(
  entries: Entry[],
): Entry[] => {
  const byId = new Map<string, Entry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
};

const groupRecords = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
>(
  records: AtProtoRecordCallbackArgs<unknown>[],
  groupBy: AtProtoRecordGroupBy<Sources>,
): Promise<Map<string, ArgsUnion<Sources>[]>> => {
  const byKey = new Map<string, ArgsUnion<Sources>[]>();

  for (const args of records) {
    const recordArgs = args as ArgsUnion<Sources>;
    const key = await groupBy(recordArgs);
    if (typeof key !== "string") {
      throw new Error(
        `AtProto loader groupBy must return a string key for ${args.repo.handle ?? args.repo.did}/${args.collection}/${args.rkey}`,
      );
    }

    const group = byKey.get(key) ?? [];
    group.push(recordArgs);
    byKey.set(key, group);
  }

  return byKey;
};

export interface RunPipelineArgs<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
> {
  sources: Sources;
  callbacks: AtProtoRecordCallbacks<Sources, Entry>;
  onSourceError?: OnSourceError;
}

/**
 * Run a full read cycle across every source:
 *
 * - For each source: fetch, validate, parse, filter records
 * - Merge survivors in source declaration order
 * - Group by key (if `groupBy` is set)
 * - Run `transform` per record or per group => nullish returns drop the entry
 * - Dedupe entries by `id`
 *
 * Error handling depends on `onSourceError`:
 *
 * - `'throw'` => the first source error rethrows immediately and the rest of
 *   is abandoned
 * - `'skip'` (or a function returning `'skip'`) => failing sources drop their
 *   contribution. If every source fails, it will still throws an `AggregateError` so
 *   the live loader's SWR cache can keep serving its last good snapshot and
 *   the static loader can fail the build
 */
export const runPipeline = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
>({
  sources,
  callbacks,
  onSourceError = "skip",
}: RunPipelineArgs<Sources, Entry>): Promise<Entry[]> => {
  const fetchRecord = createFetchRecord();

  // Ask every source for records.
  const results = await Promise.allSettled(
    sources.map((source) => fetchFromSource(source, callbacks, fetchRecord)),
  );

  // Keep successful sources and report failed ones.
  const buckets: AtProtoRecordCallbackArgs<unknown>[][] = [];
  const errors: unknown[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const source = sources[i]!;
    if (result.status === "fulfilled") {
      buckets.push(result.value);
      continue;
    }

    const error = result.reason;
    console.warn(
      `[atproto-loader] source ${source.repo}/${source.collection} failed: ${getErrorMessage(error)}`,
    );
    const decision =
      typeof onSourceError === "function"
        ? onSourceError(error, source)
        : onSourceError;
    if (decision === "throw") throw error;
    errors.push(error);
  }

  if (errors.length > 0 && errors.length === results.length) {
    throw new AggregateError(errors, "All AtProto sources failed");
  }

  // Put all records in source order.
  const merged = buckets.flat();
  const entries: Entry[] = [];

  if (!callbacks.groupBy) {
    // Turn each record into an entry.
    let dropped = 0;
    for (const args of merged) {
      const entry = await callbacks.transform(args as ArgsUnion<Sources>);
      if (entry === null || entry === undefined) {
        dropped++;
        continue;
      }
      entries.push(entry);
    }
    if (dropped > 0) {
      console.debug(
        `[atproto-loader] transform dropped ${dropped}/${merged.length} entries`,
      );
    }

    // Keep the last entry for each id.
    return dedupeEntries(entries);
  }

  // Gather related records before transforming.
  const byKey = await groupRecords(merged, callbacks.groupBy);
  let dropped = 0;
  for (const [key, records] of byKey) {
    const groupArgs: AtProtoRecordGroupTransformArgs<Sources> = {
      key,
      records,
      fetchRecord,
    };
    const entry = await callbacks.transform(groupArgs);
    if (entry === null || entry === undefined) {
      dropped++;
      continue;
    }
    entries.push(entry);
  }
  if (dropped > 0) {
    console.debug(
      `[atproto-loader] transform dropped ${dropped}/${byKey.size} groups`,
    );
  }

  // Keep the last entry for each id.
  return dedupeEntries(entries);
};
