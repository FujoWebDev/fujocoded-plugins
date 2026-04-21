import type { LiveDataEntry } from "astro";
import type { LiveLoader } from "astro/loaders";

import {
  defaultTransform,
  fetchAllFromPds,
  fetchSingleFromPds,
  getNamespacedEntry,
  type AtProtoLoaderSource,
  type AtProtoRecordCallbacks,
  type AtProtoRecordFilterOptions,
  type AtProtoRecordTransform,
  type MaybePromise,
} from "./records.ts";
import {
  dedupeEntries,
  getCollectionsLabel,
  normalizeSources,
  toError,
} from "./utils.ts";

export interface AtProtoLiveLoaderEntryFilter {
  id?: string;
  rkey?: string;
  repo?: string;
  collection?: string;
}

export interface AtProtoLoadCollectionFilterArgs<
  TData extends Record<string, unknown>,
  TCollectionFilter extends Record<string, unknown>,
> {
  entry: LiveDataEntry<TData>;
  filter: TCollectionFilter;
}

export type AtProtoLiveLoaderOptions<
  TData extends Record<string, unknown>,
  TCollectionFilter extends Record<string, unknown> = never,
> = AtProtoRecordFilterOptions & {
  /**
   * Optional request-time filtering for `getLiveCollection()`.
   */
  loadCollectionFilter?: (
    args: AtProtoLoadCollectionFilterArgs<TData, TCollectionFilter>,
  ) => MaybePromise<boolean>;
  /**
   * How long, in milliseconds, the collection cache should be kept before a
   * background refresh is triggered.
   */
  cacheTtl?: number;
} & (
    | {
        source: AtProtoLoaderSource;
        sources?: never;
        transform?: AtProtoRecordTransform<LiveDataEntry<TData>>;
      }
    | {
        source?: never;
        sources: AtProtoLoaderSource[];
        transform?: AtProtoRecordTransform<LiveDataEntry<TData>>;
      }
  );

interface SwrCacheOptions<T> {
  /**
   * Fetches fresh data. Errors are caught and passed to `onError`; the cache
   * keeps serving stale data until the next refresh succeeds.
   */
  fetch: () => Promise<T>;
  /**
   * Milliseconds after which cached data is considered stale. A read past the
   * TTL still returns the cached value synchronously but triggers a background
   * refresh.
   */
  ttl: number;
  /**
   * Initial cache value returned before the first successful fetch.
   */
  initial: T;
  onError: (error: unknown) => void;
}

/**
 * Stale-while-revalidate cache: first read awaits the initial fetch, later
 * reads return the cached value immediately and kick off a refresh if stale.
 * Concurrent refreshes share a single in-flight promise.
 */
const createSwrCache = <T>({
  fetch,
  ttl,
  initial,
  onError,
}: SwrCacheOptions<T>) => {
  let cached: T = initial;
  let cacheTime = 0;
  let refreshPromise: Promise<T> | undefined;

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

const findEntryInCache = <TData extends Record<string, unknown>>(
  entries: LiveDataEntry<TData>[],
  { requestedId, rkey }: EntryLookup,
) =>
  entries.find(
    (entry) => entry.id === requestedId || (rkey ? entry.id === rkey : false),
  );

/**
 * Direct `getRecord` path for `loadEntry`: narrows sources that match the
 * filter's repo/collection, then fetches the single record by rkey. Returns
 * `undefined` when no rkey is provided, no sources match, or nothing resolves
 * to the requested id — callers fall back to the cached collection.
 */
const findEntryBySingleFetch = async <TData extends Record<string, unknown>>(
  sources: AtProtoLoaderSource[],
  callbacks: AtProtoRecordCallbacks<LiveDataEntry<TData>>,
  { requestedId, rkey, repo, collection }: EntryLookup,
): Promise<LiveDataEntry<TData> | undefined> => {
  if (!rkey) {
    return undefined;
  }

  const candidates = sources.filter(
    (source) =>
      (!repo || source.repo === repo) &&
      (!collection || source.collection === collection),
  );

  const matchesRequestedId = (entry: LiveDataEntry<TData>) =>
    !requestedId || entry.id === requestedId;

  const [onlyCandidate] = candidates;
  if (candidates.length === 1 && onlyCandidate) {
    const entry = await fetchSingleFromPds(onlyCandidate, callbacks, rkey);
    return matchesRequestedId(entry) ? entry : undefined;
  }

  if (candidates.length > 1) {
    const results = await Promise.allSettled(
      candidates.map((source) => fetchSingleFromPds(source, callbacks, rkey)),
    );

    const match = results.find(
      (result): result is PromiseFulfilledResult<LiveDataEntry<TData>> =>
        result.status === "fulfilled" && matchesRequestedId(result.value),
    );

    return match?.value;
  }

  return undefined;
};

export const atProtoLiveLoader = <
  TData extends Record<string, unknown>,
  TCollectionFilter extends Record<string, unknown> = never,
>(
  options: AtProtoLiveLoaderOptions<TData, TCollectionFilter>,
): LiveLoader<TData, AtProtoLiveLoaderEntryFilter, TCollectionFilter> => {
  const sources = normalizeSources(options);
  const { cacheTtl = 60_000 } = options;
  const fallbackTransform =
    sources.length > 1 ? getNamespacedEntry<TData> : defaultTransform<TData>;
  const callbacks: AtProtoRecordCallbacks<LiveDataEntry<TData>> = {
    filter: options.filter,
    transform: options.transform ?? fallbackTransform,
  };

  const getEntries = createSwrCache<LiveDataEntry<TData>[]>({
    ttl: cacheTtl,
    initial: [],
    fetch: async () =>
      dedupeEntries(
        (
          await Promise.all(
            sources.map((source) => fetchAllFromPds(source, callbacks)),
          )
        ).flat(),
      ),
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
        if (!filter || !options.loadCollectionFilter) {
          return { entries };
        }

        const filteredEntries: LiveDataEntry<TData>[] = [];
        for (const entry of entries) {
          if (await options.loadCollectionFilter({ entry, filter })) {
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
        const direct = await findEntryBySingleFetch(sources, callbacks, lookup);
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
