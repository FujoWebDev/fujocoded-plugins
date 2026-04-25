import type { Loader, LoaderContext } from "astro/loaders";

import { runPipeline } from "../pipeline/run.ts";
import type {
  AtProtoLoaderSource,
  AtProtoRecordCallbacks,
  AtProtoRecordFilterOptions,
  AtProtoRecordGroupBy,
  AtProtoRecordGroupTransform,
  AtProtoRecordTransform,
  OnSourceError,
} from "../types.ts";
import {
  type AtProtoSourceOptions,
  normalizeSources,
  toNamespacedEntry,
  toRkeyEntry,
} from "../utils.ts";

export interface AtProtoStaticDataEntry<Data extends Record<string, unknown>> {
  id: string;
  data: Data;
  body?: string;
  filePath?: string;
}

type AtProtoStaticTransformOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
> =
  | {
      groupBy?: never;
      transform?: AtProtoRecordTransform<
        Sources,
        AtProtoStaticDataEntry<Data>
      >;
    }
  | {
      groupBy: AtProtoRecordGroupBy<Sources>;
      transform: AtProtoRecordGroupTransform<
        Sources,
        AtProtoStaticDataEntry<Data>
      >;
    };

export type AtProtoStaticLoaderOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
> = AtProtoRecordFilterOptions<Sources> & {
  /**
   * What to do when a single source fails. Defaults to `'throw'` everywhere,
   * so a broken source fails the build instead of quietly publishing partial
   * content. Pass `'skip'` if you'd rather ship the rest of the data and
   * accept a partial multi-source build.
   */
  onSourceError?: OnSourceError;
} & AtProtoSourceOptions<Sources> &
  AtProtoStaticTransformOptions<Sources, Data>;

export const atProtoStaticLoader = <
  const Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
>(
  options: AtProtoStaticLoaderOptions<Sources, Data>,
): Loader => {
  const sources = normalizeSources<Sources>(options);
  const fallbackTransform =
    sources.length > 1 ? toNamespacedEntry<Data> : toRkeyEntry<Data>;
  const callbacks: AtProtoRecordCallbacks<
    Sources,
    AtProtoStaticDataEntry<Data>
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
            AtProtoStaticDataEntry<Data>
          >),
      };

  const onSourceError: OnSourceError = options.onSourceError ?? "throw";

  return {
    name: "atproto-loader",

    async load(context: LoaderContext) {
      const entries = await runPipeline({
        sources,
        callbacks,
        onSourceError,
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
          data,
          body: entry.body,
          filePath: entry.filePath,
        });
      }
    },
  };
};
