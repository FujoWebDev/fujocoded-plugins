import type {
  ArgsUnion,
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordCallbacks,
  AtProtoRecordGroupBy,
  AtProtoRecordGroupTransformArgs,
  FetchRecord,
} from "../types.ts";

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

export interface JoinSourceRecordsArgs<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
> {
  sourceRecords: AtProtoRecordCallbackArgs<unknown>[][];
  callbacks: AtProtoRecordCallbacks<Sources, Entry>;
  fetchRecord: FetchRecord;
}

/**
 * Join each source's already-fetched records into entries.
 *
 * Sources are flattened in their supplied order. Records can then be grouped
 * across sources before transforming, and entries are deduped by `id`.
 */
export const joinSourceRecords = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
>({
  sourceRecords,
  callbacks,
  fetchRecord,
}: JoinSourceRecordsArgs<Sources, Entry>): Promise<Entry[]> => {
  // Put all records in source order.
  const merged = sourceRecords.flat();
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
