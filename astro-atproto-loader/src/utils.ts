import type {
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
} from "./types.ts";

export type AtProtoSourceOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
> =
  | {
      source: Sources[number];
      sources?: never;
    }
  | {
      source?: never;
      sources: Sources;
    };

export const toError = (error: unknown, message: string) =>
  error instanceof Error
    ? new Error(message, { cause: error })
    : new Error(message);

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const normalizeSources = <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
>(
  options: AtProtoSourceOptions<Sources>,
): Sources => {
  if ("source" in options && options.source) {
    return [options.source] as unknown as Sources;
  }

  if ("sources" in options && options.sources) {
    if (options.sources.length === 0) {
      throw new Error("AtProto record loaders require at least one source.");
    }
    return options.sources;
  }

  throw new Error(
    "AtProto record loaders require either `source` or `sources`.",
  );
};

export const getCollectionsLabel = (
  sources: readonly AtProtoLoaderSource<unknown>[],
) => {
  const names = [...new Set(sources.map((source) => source.collection))];
  return `collection${names.length === 1 ? "" : "s"} ${names.join(", ")}`;
};

export const toRkeyEntry = <Data extends Record<string, unknown>>({
  value,
  rkey,
}: AtProtoRecordCallbackArgs<unknown>): { id: string; data: Data } => ({
  id: rkey,
  data: value as Data,
});

/**
 * Default `transform` used when a multi-source loader is configured without
 * one. Namespaces each entry's `id` by `did/collection/rkey` so records
 * sharing the same `rkey` across different repos or collections don't
 * collide in the resulting collection.
 */
export const toNamespacedEntry = <Data extends Record<string, unknown>>({
  value,
  repo,
  collection,
  rkey,
}: AtProtoRecordCallbackArgs<unknown>): { id: string; data: Data } => ({
  id: `${repo.did}/${collection}/${rkey}`,
  data: value as Data,
});
