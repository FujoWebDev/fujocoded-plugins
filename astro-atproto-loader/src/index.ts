import type { Loader, LoaderContext } from "astro/loaders";
import {
  defaultTransform,
  fetchAllFromPds,
  type AtProtoLoaderSource,
  type AtProtoRecordCallbacks,
  type AtProtoRecordFilterOptions,
  type AtProtoRecordTransform,
} from "./records.ts";

export type {
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordContext,
  AtProtoRecordFilterOptions,
  RecordValue,
} from "./records.ts";

export interface AtProtoStaticDataEntry<TData extends Record<string, unknown>> {
  id: string;
  data: TData;
  body?: string;
  filePath?: string;
}

export type AtProtoStaticLoaderOptions<TData extends Record<string, unknown>> =
  AtProtoRecordFilterOptions &
    (
      | {
          source: AtProtoLoaderSource;
          sources?: never;
          transform?: AtProtoRecordTransform<AtProtoStaticDataEntry<TData>>;
        }
      | {
          source?: never;
          sources: AtProtoLoaderSource[];
          transform: AtProtoRecordTransform<AtProtoStaticDataEntry<TData>>;
        }
    );

const normalizeSources = <
  TOptions extends {
    source?: AtProtoLoaderSource;
    sources?: AtProtoLoaderSource[];
  },
>(
  options: TOptions,
): AtProtoLoaderSource[] => {
  if ("source" in options && options.source) {
    return [options.source];
  }

  if ("sources" in options && options.sources) {
    if (options.sources.length === 0) {
      throw new Error("AtProto record loaders require at least one source.");
    }
    return options.sources;
  }

  throw new Error("AtProto record loaders require either `source` or `sources`.");
};

const dedupeEntries = <TEntry extends { id: string }>(entries: TEntry[]) => {
  const byId = new Map<string, TEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }

  return [...byId.values()];
};

export const atProtoStaticLoader = <TData extends Record<string, unknown>>(
  options: AtProtoStaticLoaderOptions<TData>,
): Loader => {
  if ("sources" in options && options.sources && !options.transform) {
    throw new Error(
      "atProtoStaticLoader requires `transform` when `sources` is used.",
    );
  }

  const sources = normalizeSources(options);
  const callbacks: AtProtoRecordCallbacks<AtProtoStaticDataEntry<TData>> = {
    filter: options.filter,
    transform: options.transform ?? defaultTransform<TData>,
  };

  return {
    name: "atproto-loader",

    async load(context: LoaderContext) {
      const entries = dedupeEntries(
        (
          await Promise.all(
            sources.map((source) => fetchAllFromPds(source, callbacks)),
          )
        ).flat(),
      );

      context.store.clear();

      for (const entry of entries) {
        const data = await context.parseData({
          id: entry.id,
          data: entry.data,
          filePath: entry.filePath,
        });

        context.store.set({
          id: entry.id,
          data,
          body: entry.body,
          filePath: entry.filePath,
        });
      }
    },
  };
};
