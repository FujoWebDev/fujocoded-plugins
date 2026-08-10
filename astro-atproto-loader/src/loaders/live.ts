import type { LiveDataEntry } from "astro";
import { defineLiveCollection } from "astro/content/config";
import type { LiveLoader } from "astro/loaders";

import {
  createSourceCaches,
  type OnInitialLoadError,
} from "../cache/source-caches.ts";
import { defaultAtProtoCache, type AtProtoCache } from "../cache/index.ts";
import { createFetchRecord } from "../pipeline/fetch-record.ts";
import { joinSourceRecords } from "../pipeline/join.ts";
import { findEntryViaFetch, type EntryLookup } from "../pipeline/single.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordFilterOptions,
  AtProtoRecordGroupBy,
  AtProtoRecordGroupTransform,
  AtProtoRecordTransform,
  AtProtoTransformOptions,
  MaybePromise,
  OnSourceError,
  SchemaInput,
  SchemaLike,
} from "../types.ts";
import {
  type AtProtoSourceOptions,
  getCollectionsLabel,
  normalizeSources,
  resolveRecordCallbacks,
  toError,
  toSafePojo,
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

export type { OnInitialLoadError };

export type AtProtoLiveLoaderOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
  QueryFilter extends Record<string, unknown> = never,
> = AtProtoRecordFilterOptions<Sources> & {
  /**
   * Cache shared by this loader. Omit it to use the process-wide default.
   * Pass the same cache to several loaders to share identity and hydrated
   * record results between them.
   */
  cache?: AtProtoCache;
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
   * What to do if a cold source read fails (when the source does
   * not yet have a successful snapshot). The read includes `filter`.
   * `groupBy` and `transform` run afterward and always return loader errors.
   *
   * - `'empty'` => treat the first failed fetch as an empty collection / miss
   *   (default)
   * - `'throw'` => surface the error to Astro
   */
  onInitialLoadError?: OnInitialLoadError;
  /**
   * How long, in milliseconds, each source's cached records are considered
   * fresh before a background refresh is triggered. Hydrated records use an
   * independent fixed five-minute policy. Defaults to five minutes.
   */
  cacheTtl?: number;
} & AtProtoSourceOptions<Sources> &
  AtProtoTransformOptions<Sources, LiveDataEntry<Data>>;

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

export const atProtoLiveLoader = <
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
  QueryFilter extends Record<string, unknown> = never,
>(
  options: AtProtoLiveLoaderOptions<Sources, Data, QueryFilter>,
): LiveLoader<Data, AtProtoLiveLoaderEntryFilter, QueryFilter> => {
  const sources = normalizeSources<Sources>(options);
  const { cacheTtl = 5 * 60_000, onInitialLoadError = "empty" } = options;
  const callbacks = resolveRecordCallbacks<Sources, Data, LiveDataEntry<Data>>(
    sources,
    options,
  );

  const onSourceError: OnSourceError =
    options.onSourceError ??
    ("sources" in options && options.sources ? "skip" : "throw");

  const caches = options.cache ?? defaultAtProtoCache;
  const fetchRecord = createFetchRecord(caches);
  const readSources = createSourceCaches({
    sources,
    callbacks,
    fetchRecord,
    cacheTtl,
    onSourceError,
    onInitialLoadError,
    caches,
  });

  const getEntries = async (): Promise<LiveDataEntry<Data>[]> => {
    const entries = await joinSourceRecords({
      sourceRecords: await readSources(),
      callbacks,
      fetchRecord,
    });
    return entries.map((entry) => ({
      ...entry,
      data: toSafePojo(entry.data),
    }));
  };

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
        const direct = await findEntryViaFetch(
          sources,
          callbacks,
          lookup,
          caches,
        );
        if (direct) {
          return { ...direct, data: toSafePojo(direct.data) };
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
  /**
   * Cache shared by this collection's loader. Omit it to use the
   * process-wide default.
   */
  cache?: AtProtoCache;
  onSourceError?: OnSourceError;
  /**
   * What to do if a cold source read fails. The read includes
   * `filter`; `groupBy` and `transform` failures always return loader errors.
   */
  onInitialLoadError?: OnInitialLoadError;
  /**
   * How long each source's cached records stay fresh before a background refresh.
   * Hydrated records use an independent fixed five-minute policy. Defaults to
   * five minutes.
   */
  cacheTtl?: number;
  queryFilter?: (
    args: AtProtoQueryFilterArgs<SchemaInput<Schema>, QueryFilter>,
  ) => MaybePromise<boolean>;
} & AtProtoRecordFilterOptions<Sources>;

type LiveCollection<Schema extends SchemaLike> = ReturnType<
  typeof defineLiveCollection
> & {
  schema: Schema;
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
// Single source, ungrouped (most common, so it goes first to make TS report
// more sensible type errors)
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
// For once, "any is fine": the four overloads above are the public, fully-typed
// interface; `any` is just an escape hatch here. A non-generic implementation
// cannot return something that's assignable to every overload's
// `LiveCollection<Schema>` value, and a generic implementation for config
// cannot cover all possible shapes of `LiveCollection<Schema>` at the same
// time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineAtProtoLiveCollection(config: any): any {
  const { outputSchema, ...loaderOptions } = config as {
    outputSchema: SchemaLike;
    [key: string]: unknown;
  };
  return defineLiveCollection({
    schema: outputSchema as Parameters<
      typeof defineLiveCollection
    >[0]["schema"],
    loader: atProtoLiveLoader(
      loaderOptions as unknown as Parameters<typeof atProtoLiveLoader>[0],
    ),
  });
}
