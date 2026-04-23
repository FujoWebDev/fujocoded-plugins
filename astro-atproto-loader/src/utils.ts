import type { AtProtoLoaderSource } from "./records.ts";

export const toError = (error: unknown, message: string) =>
  error instanceof Error
    ? new Error(message, { cause: error })
    : new Error(message);

export const normalizeSources = <
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

  throw new Error(
    "AtProto record loaders require either `source` or `sources`.",
  );
};

export const getCollectionsLabel = (sources: AtProtoLoaderSource[]) => {
  const names = [...new Set(sources.map((source) => source.collection))];
  return `collection${names.length === 1 ? "" : "s"} ${names.join(", ")}`;
};

export const dedupeEntries = <TEntry extends { id: string }>(
  entries: TEntry[],
) => {
  const byId = new Map<string, TEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
};
