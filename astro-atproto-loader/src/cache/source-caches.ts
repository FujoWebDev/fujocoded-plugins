import type { AtProtoCache } from "./index.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordFilterOptions,
  FetchRecord,
  OnSourceError,
} from "../types.ts";
import { fetchFromSource } from "../pipeline/source.ts";
import { getCollectionsLabel } from "../utils.ts";
import { createSwrCache } from "./swr.ts";

export type OnInitialLoadError = "throw" | "empty";

type SourceRecords = AtProtoRecordCallbackArgs<unknown>[];
type SourceErrorDecision = "skip" | "throw";

export const SOURCE_RETRY_TTL_MS = 5_000;

class SourceFetchFailure {
  constructor(
    readonly sourceError: unknown,
    readonly decision: SourceErrorDecision,
  ) {}
}

interface CreateSourceCacheArgs<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
> {
  source: AtProtoLoaderSource<unknown>;
  callbacks: AtProtoRecordFilterOptions<Sources>;
  fetchRecord: FetchRecord;
  cacheTtl: number;
  onSourceError: OnSourceError;
  caches: AtProtoCache;
}

const createSourceCache = <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
>({
  source,
  callbacks,
  fetchRecord,
  cacheTtl,
  onSourceError,
  caches,
}: CreateSourceCacheArgs<Sources>): (() => Promise<SourceRecords>) =>
  createSwrCache<SourceRecords>({
    ttl: cacheTtl,
    failureTtl: SOURCE_RETRY_TTL_MS,
    onRefresh: (refresh) => caches.onRefresh(refresh),
    fetch: async () => {
      try {
        return await fetchFromSource(source, callbacks, fetchRecord, caches);
      } catch (error) {
        throw new SourceFetchFailure(
          error,
          typeof onSourceError === "function"
            ? onSourceError(error, source)
            : onSourceError,
        );
      }
    },
    onError: (error) => {
      const sourceError =
        error instanceof SourceFetchFailure ? error.sourceError : error;
      console.warn(
        `[atproto-loader] source ${source.repo}/${source.collection} refresh failed:`,
        sourceError,
      );
    },
  });

export interface CreateSourceCachesArgs<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
> {
  sources: Sources;
  callbacks: AtProtoRecordFilterOptions<Sources>;
  fetchRecord: FetchRecord;
  cacheTtl: number;
  onSourceError: OnSourceError;
  onInitialLoadError: OnInitialLoadError;
  caches: AtProtoCache;
}

/**
 * Cache each source's fetched records independently and read them as one
 * ordered set.
 *
 * Readers stay in source declaration order. A warm source whose refresh fails
 * keeps returning its stale records. Cold failures follow the error policies:
 * `onSourceError` decides whether a single cold source is skipped or fatal,
 * and `onInitialLoadError` decides whether a fatal cold read surfaces to the
 * caller (`'throw'`) or degrades to an empty read (`'empty'`). Either way the
 * failure is reported to the console.
 */
export const createSourceCaches = <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
>({
  sources,
  callbacks,
  fetchRecord,
  cacheTtl,
  onSourceError,
  onInitialLoadError,
  caches,
}: CreateSourceCachesArgs<Sources>) => {
  const readers = sources.map((source) =>
    createSourceCache({
      source,
      callbacks,
      fetchRecord,
      cacheTtl,
      onSourceError,
      caches,
    }),
  );

  const readAllSources = async (): Promise<SourceRecords[]> => {
    const results = await Promise.allSettled(readers.map((read) => read()));
    const sourceRecords: SourceRecords[] = [];
    const errors: unknown[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        sourceRecords.push(result.value);
        continue;
      }

      if (!(result.reason instanceof SourceFetchFailure)) {
        throw result.reason;
      }
      if (result.reason.decision === "throw") {
        throw result.reason.sourceError;
      }
      errors.push(result.reason.sourceError);
    }

    if (errors.length > 0 && errors.length === results.length) {
      throw new AggregateError(errors, "All AtProto sources failed");
    }

    return sourceRecords;
  };

  return async (): Promise<SourceRecords[]> => {
    try {
      return await readAllSources();
    } catch (error) {
      console.error(
        `[atproto-loader:${getCollectionsLabel(sources)}] refresh failed:`,
        error,
      );
      if (onInitialLoadError === "throw") {
        throw error;
      }
      return [];
    }
  };
};
