import type { LiveDataEntry } from "astro";
import type { LiveLoader } from "astro/loaders";

import { runPipeline } from "../pipeline/run.ts";
import { runSingleFetch } from "../pipeline/single.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordCallbacks,
  AtProtoRecordFilterOptions,
  AtProtoRecordGroupBy,
  AtProtoRecordGroupTransform,
  AtProtoRecordTransform,
  MaybePromise,
  OnSourceError,
  SchemaInput,
  SchemaLike,
} from "../types.ts";
import {
  type AtProtoSourceOptions,
  getCollectionsLabel,
  normalizeSources,
  toNamespacedEntry,
  toError,
  toRkeyEntry,
} from "../utils.ts";

export interface AtProtoLiveLoaderEntryFilter {
  id?: string;
  rkey?: string;
  repo?: string;
  collection?: string;
}

export interface AtProtoQueryFilterArgs<
  Data extends Record<string, unknown>,
  QueryFilter extends Record<string, unknown>,
> {
  entry: LiveDataEntry<Data>;
  filter: QueryFilter;
}

type AtProtoLiveTransformOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
> =
  | {
      groupBy?: never;
      transform?: AtProtoRecordTransform<Sources, LiveDataEntry<Data>>;
    }
  | {
      groupBy: AtProtoRecordGroupBy<Sources>;
      transform: AtProtoRecordGroupTransform<Sources, LiveDataEntry<Data>>;
    };

export type AtProtoLiveLoaderOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
  QueryFilter extends Record<string, unknown> = never,
> = AtProtoRecordFilterOptions<Sources> & {
  /**
   * What to do when a source fails, according to what's passed:
   * - `sources: [...]` => defaults to `'skip'`, so one flaky PDS doesn't take
   *   down the whole live collection
   * - `source: {...}` => defaults to `'throw'`, since there's no other source
   *   to fall back to
   */
  onSourceError?: OnSourceError;
  /**
   * Optional request-time filter applied when callers pass a filter to
   * `getLiveCollection("collection", filter)`. Receives the entry and the
   * caller's filter, and returns whether to include the entry.
   */
  queryFilter?: (
    args: AtProtoQueryFilterArgs<Data, QueryFilter>,
  ) => MaybePromise<boolean>;
  /**
   * How long, in milliseconds, the cached collection is considered fresh
   * before a background refresh is triggered. Defaults to five minutes.
   */
  cacheTtl?: number;
} & AtProtoSourceOptions<Sources> &
  AtProtoLiveTransformOptions<Sources, Data>;

interface SwrCacheOptions<Snapshot> {
  /**
   * Fetches fresh data. Errors are caught and passed to `onError`; the cache
   * keeps serving stale data until the next refresh succeeds.
   */
  fetch: () => Promise<Snapshot>;
  /**
   * Milliseconds after which cached data is considered stale. A read past the
   * TTL still returns the cached value synchronously but triggers a background
   * refresh.
   */
  ttl: number;
  /**
   * Initial cache value returned before the first successful fetch.
   */
  initial: Snapshot;
  onError: (error: unknown) => void;
}

/**
 * A small stale-while-revalidate cache.
 *
 * The first read awaits the initial fetch. Later reads return the cached
 * value immediately, and kick off a background refresh if the value is older
 * than `ttl`. Concurrent refreshes share a single in-flight promise. If a
 * refresh fails (for example because every source threw and the pipeline
 * raised an `AggregateError`), the previous snapshot is preserved and the
 * error is reported through `onError`.
 */
const createSwrCache = <Snapshot>({
  fetch,
  ttl,
  initial,
  onError,
}: SwrCacheOptions<Snapshot>) => {
  let cached: Snapshot = initial;
  let cacheTime = 0;
  let refreshPromise: Promise<Snapshot> | undefined;

  const triggerRefresh = () => {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const value = await fetch();
        cached = value;
        cacheTime = Date.now();
        return value;
      } catch (error) {
        onError(error);
        return cached;
      } finally {
        refreshPromise = undefined;
      }
    })();

    return refreshPromise;
  };

  return async () => {
    if (cacheTime === 0) {
      return triggerRefresh();
    }

    if (Date.now() - cacheTime > ttl) {
      void triggerRefresh();
    }

    return cached;
  };
};

interface EntryLookup {
  requestedId: string | undefined;
  rkey: string | undefined;
  repo: string | undefined;
  collection: string | undefined;
}

const getRequestedLookup = (
  filter: AtProtoLiveLoaderEntryFilter | { id: string },
): EntryLookup => {
  const requestedId = filter.id;
  return {
    requestedId,
    rkey: ("rkey" in filter ? filter.rkey : undefined) ?? requestedId,
    repo: "repo" in filter ? filter.repo : undefined,
    collection: "collection" in filter ? filter.collection : undefined,
  };
};

const findEntryInCache = <Data extends Record<string, unknown>>(
  entries: LiveDataEntry<Data>[],
  { requestedId, rkey }: EntryLookup,
) =>
  entries.find(
    (entry) => entry.id === requestedId || (rkey ? entry.id === rkey : false),
  );

/**
 * Try to resolve a single requested entry with direct `getRecord` calls,
 * instead of waiting on the full collection refresh.
 *
 * The lookup goes through these steps:
 *
 * - Pick the sources whose `repo` and `collection` match the lookup
 * - Fetch each by `rkey`, in parallel when several sources match
 * - Return the first entry that lines up with the requested `id`
 *
 * Returns `undefined` in these cases:
 *
 * - No `rkey` was provided
 * - No sources match the lookup
 * - Nothing resolved to the requested `id`
 *
 * Callers should fall back to looking inside the cached collection.
 */
const findEntryViaFetch = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
>(
  sources: readonly AtProtoLoaderSource<unknown>[],
  callbacks: AtProtoRecordCallbacks<Sources, LiveDataEntry<Data>>,
  { requestedId, rkey, repo, collection }: EntryLookup,
): Promise<LiveDataEntry<Data> | undefined> => {
  if (!rkey) {
    return undefined;
  }

  const candidates = sources.filter(
    (source) =>
      (!repo || source.repo === repo) &&
      (!collection || source.collection === collection),
  );

  const matchesRequestedId = (entry: LiveDataEntry<Data>) =>
    !requestedId || entry.id === requestedId;

  const [onlyCandidate] = candidates;
  if (candidates.length === 1 && onlyCandidate) {
    const entry = await runSingleFetch(onlyCandidate, callbacks, rkey);
    if (!entry) return undefined;
    return matchesRequestedId(entry) ? entry : undefined;
  }

  if (candidates.length > 1) {
    const results = await Promise.allSettled(
      candidates.map((source) => runSingleFetch(source, callbacks, rkey)),
    );

    const match = results.find(
      (result): result is PromiseFulfilledResult<LiveDataEntry<Data>> =>
        result.status === "fulfilled" &&
        result.value !== undefined &&
        matchesRequestedId(result.value),
    );

    return match?.value;
  }

  return undefined;
};

export const atProtoLiveLoader = <
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
  QueryFilter extends Record<string, unknown> = never,
>(
  options: AtProtoLiveLoaderOptions<Sources, Data, QueryFilter>,
): LiveLoader<Data, AtProtoLiveLoaderEntryFilter, QueryFilter> => {
  const sources = normalizeSources<Sources>(options);
  const { cacheTtl = 5 * 60_000 } = options;
  const fallbackTransform =
    sources.length > 1 ? toNamespacedEntry<Data> : toRkeyEntry<Data>;
  const callbacks: AtProtoRecordCallbacks<
    Sources,
    LiveDataEntry<Data>
  > = "groupBy" in options && options.groupBy
    ? {
        filter: options.filter,
        groupBy: options.groupBy,
        transform: options.transform,
      }
    : {
        filter: options.filter,
        transform:
          options.transform ??
          (fallbackTransform as AtProtoRecordTransform<
            Sources,
            LiveDataEntry<Data>
          >),
      };

  const onSourceError: OnSourceError =
    options.onSourceError ??
    ("sources" in options && options.sources ? "skip" : "throw");

  const getEntries = createSwrCache<LiveDataEntry<Data>[]>({
    ttl: cacheTtl,
    initial: [],
    fetch: () =>
      runPipeline({
        sources,
        callbacks,
        onSourceError,
      }),
    onError: (error) => {
      console.error(
        `[atproto-loader:${getCollectionsLabel(sources)}] refresh failed:`,
        error,
      );
    },
  });

  return {
    name: "atproto-loader",

    async loadCollection({ filter }) {
      try {
        const entries = await getEntries();
        if (!filter || !options.queryFilter) {
          return { entries };
        }

        const filteredEntries: LiveDataEntry<Data>[] = [];
        for (const entry of entries) {
          if (await options.queryFilter({ entry, filter })) {
            filteredEntries.push(entry);
          }
        }

        return { entries: filteredEntries };
      } catch (error) {
        return {
          error: toError(
            error,
            `Failed to load the AtProto record from ${getCollectionsLabel(sources)}`,
          ),
        };
      }
    },

    async loadEntry({ filter }) {
      const lookup = getRequestedLookup(filter);

      try {
        const direct = await findEntryViaFetch(sources, callbacks, lookup);
        if (direct) {
          return direct;
        }

        const entries = await getEntries();
        return findEntryInCache(entries, lookup);
      } catch (error) {
        try {
          const entries = await getEntries();
          return findEntryInCache(entries, lookup);
        } catch {
          return {
            error: toError(
              error,
              `Failed to load the AtProto record from ${getCollectionsLabel(
                sources,
              )}/${lookup.requestedId ?? lookup.rkey ?? "unknown"}`,
            ),
          };
        }
      }
    },
  };
};

type LiveBaseConfig<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Schema extends SchemaLike,
  QueryFilter extends Record<string, unknown>,
> = {
  outputSchema: Schema;
  onSourceError?: OnSourceError;
  cacheTtl?: number;
  queryFilter?: (
    args: AtProtoQueryFilterArgs<SchemaInput<Schema>, QueryFilter>,
  ) => MaybePromise<boolean>;
} & AtProtoRecordFilterOptions<Sources>;

type LiveCollection<Schema extends SchemaLike> = {
  type: "live";
  schema: Schema;
  loader: ReturnType<typeof atProtoLiveLoader>;
};

/**
 * Live AtProto collection. `transform`'s return is typed against
 * `z.input<outputSchema>`, so `value`, `did`, `rkey` etc. are inferred from
 * each source's `parseRecord`. No `typeof sources` annotation needed.
 *
 * Accepts either `source: {...}` for one repo or `sources: [...]` for many.
 *
 * Pass `groupBy` to aggregate records across sources by key. The grouped
 * `transform` then receives `{ key, records, fetchRecord }`.
 */
// Single source, grouped
export function defineAtProtoLiveCollection<
  const Source extends AtProtoLoaderSource<unknown>,
  Schema extends SchemaLike,
  QueryFilter extends Record<string, unknown> = never,
>(
  config: LiveBaseConfig<readonly [Source], Schema, QueryFilter> & {
    source: Source;
    sources?: never;
    groupBy: AtProtoRecordGroupBy<readonly [Source]>;
    transform: AtProtoRecordGroupTransform<
      readonly [Source],
      LiveDataEntry<SchemaInput<Schema>>
    >;
  },
): LiveCollection<Schema>;
// Single source, ungrouped
export function defineAtProtoLiveCollection<
  const Source extends AtProtoLoaderSource<unknown>,
  Schema extends SchemaLike,
  QueryFilter extends Record<string, unknown> = never,
>(
  config: LiveBaseConfig<readonly [Source], Schema, QueryFilter> & {
    source: Source;
    sources?: never;
    groupBy?: undefined;
    transform?: AtProtoRecordTransform<
      readonly [Source],
      LiveDataEntry<SchemaInput<Schema>>
    >;
  },
): LiveCollection<Schema>;
// Multi source, grouped
export function defineAtProtoLiveCollection<
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Schema extends SchemaLike,
  QueryFilter extends Record<string, unknown> = never,
>(
  config: LiveBaseConfig<Sources, Schema, QueryFilter> & {
    source?: never;
    sources: Sources;
    groupBy: AtProtoRecordGroupBy<Sources>;
    transform: AtProtoRecordGroupTransform<
      Sources,
      LiveDataEntry<SchemaInput<Schema>>
    >;
  },
): LiveCollection<Schema>;
// Multi source, ungrouped
export function defineAtProtoLiveCollection<
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Schema extends SchemaLike,
  QueryFilter extends Record<string, unknown> = never,
>(
  config: LiveBaseConfig<Sources, Schema, QueryFilter> & {
    source?: never;
    sources: Sources;
    groupBy?: undefined;
    transform?: AtProtoRecordTransform<
      Sources,
      LiveDataEntry<SchemaInput<Schema>>
    >;
  },
): LiveCollection<Schema>;
// Implementation signature. The four overloads above are the public,
// fully-typed surface; this signature is invisible to callers. `any` is the
// idiomatic escape hatch here: `LiveCollection<Schema>` returned from a
// non-generic impl can't be assignable to `LiveCollection<Schema>` for
// every overload's instantiated `Schema'` (covariance dead-end), and a
// generic impl can't unify across overloads either.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineAtProtoLiveCollection(config: any): any {
  const { outputSchema, ...loaderOptions } = config as {
    outputSchema: SchemaLike;
    [key: string]: unknown;
  };
  return {
    type: "live" as const,
    schema: outputSchema,
    loader: atProtoLiveLoader(
      loaderOptions as unknown as Parameters<typeof atProtoLiveLoader>[0],
    ),
  };
}
