import type { AtProtoCache } from "../cache/index.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordCallbacks,
  OnSourceError,
} from "../types.ts";
import { getErrorMessage } from "../utils.ts";
import { createFetchRecord } from "./fetch-record.ts";
import { joinSourceRecords } from "./join.ts";
import { fetchFromSource } from "./source.ts";

export interface RunPipelineArgs<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
> {
  sources: Sources;
  callbacks: AtProtoRecordCallbacks<Sources, Entry>;
  onSourceError?: OnSourceError;
  caches: AtProtoCache;
}

/**
 * Run the static loader's full read cycle across every source:
 *
 * - For each source: fetch, validate, parse, filter records
 * - Merge survivors in source declaration order
 * - Group by key (if `groupBy` is set)
 * - Run `transform` per record or per group => nullish returns drop the entry
 * - Dedupe entries by `id`
 *
 * All source reads are started concurrently and allowed to complete before their
 * results are evaluated. Error handling then depends on `onSourceError`:
 *
 * - `'throw'` => rethrow the first failed source in declaration order after
 *   every source read has settled
 * - `'skip'` (or a function returning `'skip'`) => failing sources drop their
 *   contribution. If every source fails, throw an `AggregateError` containing
 *   every source failure so the static build fails with the full cause set
 *
 * The live loader does not use this path. It acquires records through its
 * per-source stale-while-revalidate cache, then joins the resulting records.
 */
export const runPipeline = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry extends { id: string },
>({
  sources,
  callbacks,
  onSourceError = "skip",
  caches,
}: RunPipelineArgs<Sources, Entry>): Promise<Entry[]> => {
  const fetchRecord = createFetchRecord(caches);

  // Ask every source for records.
  const results = await Promise.allSettled(
    sources.map((source) =>
      fetchFromSource(source, callbacks, fetchRecord, caches),
    ),
  );

  // Keep successful sources and report failed ones.
  const sourceRecords: AtProtoRecordCallbackArgs<unknown>[][] = [];
  const errors: unknown[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const source = sources[i]!;
    if (result.status === "fulfilled") {
      sourceRecords.push(result.value);
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

  return joinSourceRecords({ sourceRecords, callbacks, fetchRecord });
};
