import type { Loader, LoaderContext } from "astro/loaders";

import {
  defaultTransform,
  fetchAllFromPds,
  getNamespacedEntry,
  type AtProtoLoaderSource,
  type AtProtoRecordCallbacks,
  type AtProtoRecordFilterOptions,
  type AtProtoRecordTransform,
} from "./records.ts";
import { dedupeEntries, normalizeSources } from "./utils.ts";

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
          transform?: AtProtoRecordTransform<AtProtoStaticDataEntry<TData>>;
        }
    );

export const atProtoStaticLoader = <TData extends Record<string, unknown>>(
  options: AtProtoStaticLoaderOptions<TData>,
): Loader => {
  const sources = normalizeSources(options);
  const fallbackTransform =
    sources.length > 1 ? getNamespacedEntry<TData> : defaultTransform<TData>;
  const callbacks: AtProtoRecordCallbacks<AtProtoStaticDataEntry<TData>> = {
    filter: options.filter,
    transform: options.transform ?? fallbackTransform,
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
