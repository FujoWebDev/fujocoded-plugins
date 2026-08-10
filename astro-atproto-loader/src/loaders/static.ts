import { defineCollection } from "astro/content/config";
import type { Loader, LoaderContext } from "astro/loaders";

import { defaultAtProtoCache, type AtProtoCache } from "../cache/index.ts";
import { runPipeline } from "../pipeline/run.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordFilterOptions,
  AtProtoRecordGroupBy,
  AtProtoRecordGroupTransform,
  AtProtoRecordTransform,
  AtProtoTransformOptions,
  OnSourceError,
  SchemaInput,
  SchemaLike,
} from "../types.ts";
import {
  type AtProtoSourceOptions,
  normalizeSources,
  resolveRecordCallbacks,
  toSafePojo,
} from "../utils.ts";

export interface AtProtoStaticDataEntry<Data extends Record<string, unknown>> {
  id: string;
  data: Data;
  body?: string;
  filePath?: string;
}

export type AtProtoStaticLoaderOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
> = AtProtoRecordFilterOptions<Sources> & {
  /**
   * Cache shared by this loader. Pass the same cache to several loaders to
   * share identity and hydrated record results between them.
   *
   *  Omit it to use the default.
   */
  cache?: AtProtoCache;
  /**
   * What to do when a single source fails. Defaults to `'throw'` everywhere,
   * so a broken source fails the build instead of quietly publishing partial
   * content. Pass `'skip'` if you'd rather ship the rest of the data and
   * accept a partial multi-source build.
   */
  onSourceError?: OnSourceError;
} & AtProtoSourceOptions<Sources> &
  AtProtoTransformOptions<Sources, AtProtoStaticDataEntry<Data>>;

export const atProtoStaticLoader = <
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
>(
  options: AtProtoStaticLoaderOptions<Sources, Data>,
): Loader => {
  const sources = normalizeSources<Sources>(options);
  const callbacks = resolveRecordCallbacks<
    Sources,
    Data,
    AtProtoStaticDataEntry<Data>
  >(sources, options);

  const onSourceError: OnSourceError = options.onSourceError ?? "throw";
  const caches = options.cache ?? defaultAtProtoCache;

  return {
    name: "atproto-loader",

    async load(context: LoaderContext) {
      const entries = await runPipeline({
        sources,
        callbacks,
        onSourceError,
        caches,
      });

      context.store.clear();

      for (const entry of entries) {
        const data = await context.parseData({
          id: entry.id,
          data: entry.data,
          filePath: entry.filePath,
        });

        context.store.set({
          id: entry.id,
          data: toSafePojo(data),
          body: entry.body,
          filePath: entry.filePath,
        });
      }
    },
  };
};

type StaticBaseConfig<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Schema extends SchemaLike,
> = {
  outputSchema: Schema;
  /**
   * Cache shared by this collection's loader. Omit it to use the
   * process-wide default.
   */
  cache?: AtProtoCache;
  onSourceError?: OnSourceError;
} & AtProtoRecordFilterOptions<Sources>;

type StaticCollection<Schema extends SchemaLike> = ReturnType<
  typeof defineCollection
> & {
  schema: Schema;
};

/**
 * Static AtProto collection, built once at build time. `transform`'s return is
 * typed against `z.input<outputSchema>`.
 *
 * Accepts either `source: {...}` for one repo or `sources: [...]` for many.
 *
 * Pass `groupBy` to aggregate records across sources by key. The grouped
 * `transform` then receives `{ key, records, fetchRecord }`.
 */
// Single source, ungrouped (most common, so it goes first to make TS report
// more sensible type errors)
export function defineAtProtoCollection<
  const Source extends AtProtoLoaderSource<unknown>,
  Schema extends SchemaLike,
>(
  config: StaticBaseConfig<readonly [Source], Schema> & {
    source: Source;
    sources?: never;
    groupBy?: undefined;
    transform?: AtProtoRecordTransform<
      readonly [Source],
      AtProtoStaticDataEntry<SchemaInput<Schema>>
    >;
  },
): StaticCollection<Schema>;
// Single source, grouped
export function defineAtProtoCollection<
  const Source extends AtProtoLoaderSource<unknown>,
  Schema extends SchemaLike,
>(
  config: StaticBaseConfig<readonly [Source], Schema> & {
    source: Source;
    sources?: never;
    groupBy: AtProtoRecordGroupBy<readonly [Source]>;
    transform: AtProtoRecordGroupTransform<
      readonly [Source],
      AtProtoStaticDataEntry<SchemaInput<Schema>>
    >;
  },
): StaticCollection<Schema>;
// Multi source, ungrouped
export function defineAtProtoCollection<
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Schema extends SchemaLike,
>(
  config: StaticBaseConfig<Sources, Schema> & {
    source?: never;
    sources: Sources;
    groupBy?: undefined;
    transform?: AtProtoRecordTransform<
      Sources,
      AtProtoStaticDataEntry<SchemaInput<Schema>>
    >;
  },
): StaticCollection<Schema>;
// Multi source, grouped
export function defineAtProtoCollection<
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Schema extends SchemaLike,
>(
  config: StaticBaseConfig<Sources, Schema> & {
    source?: never;
    sources: Sources;
    groupBy: AtProtoRecordGroupBy<Sources>;
    transform: AtProtoRecordGroupTransform<
      Sources,
      AtProtoStaticDataEntry<SchemaInput<Schema>>
    >;
  },
): StaticCollection<Schema>;
// Implementation signature. See the matching note in
// `defineAtProtoLiveCollection`: `any` is the idiomatic escape hatch for the
// implementation of a generic overload set; the overloads above are the types
// the callers actually see.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineAtProtoCollection(config: any): any {
  const { outputSchema, ...loaderOptions } = config as {
    outputSchema: SchemaLike;
    [key: string]: unknown;
  };
  return defineCollection({
    schema: outputSchema as Parameters<typeof defineCollection>[0]["schema"],
    loader: atProtoStaticLoader(
      loaderOptions as unknown as Parameters<typeof atProtoStaticLoader>[0],
    ),
  });
}
