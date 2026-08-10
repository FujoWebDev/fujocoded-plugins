import { BlobRef, ComAtprotoRepoGetRecord } from "@atproto/api";

import type {
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordCallbacks,
  AtProtoRecordFilterOptions,
  AtProtoRecordTransform,
  AtProtoTransformOptions,
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

/**
 * Astro's data store serializes with `devalue`, which rejects non-POJOs, which
 * is a funny way to say non-"Plain Old JavaScript Objects" (e.g. class
 * instances).  AtProto records returned by `@atproto/api` can include `BlobRef`
 * and `CID` instances, which makes devalue unhappy, so we flatten those shapes
 * into their canonical AT Protocol JSON form (`{$link}`, `{$bytes}`).
 *
 * Note: not *strictly* necessary for live collections (no devalue), but the
 * issue can appear anyway in other contexts, so yay for consistency that also
 * spares people some pain.
 *
 * See https://github.com/Rich-Harris/devalue#error-handling
 */
export const toSafePojo = <T>(value: T): T => toSafePojoValue(value) as T;

const toSafePojoValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;

  if (value instanceof BlobRef) {
    // BlobRef.toJSON() already returns the lex-JSON form (CID becomes {$link}).
    return value.toJSON();
  }

  // Multiformats CID fingerprint: the `asCID` getter returns `this` for valid
  // instances. Same check `CID.asCID()` uses internally.
  if ((value as { asCID?: unknown }).asCID === value) {
    return { $link: (value as { toString(): string }).toString() };
  }

  // devalue handles these natively, do not transform
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof URL ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  if (Array.isArray(value)) return value.map(toSafePojoValue);

  if (value instanceof Map) {
    return new Map(
      [...value].map(([k, v]) => [toSafePojoValue(k), toSafePojoValue(v)]),
    );
  }
  if (value instanceof Set) {
    return new Set([...value].map(toSafePojoValue));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = toSafePojoValue(item);
  }
  return result;
};

export const toError = (error: unknown, message: string) =>
  error instanceof Error
    ? new Error(message, { cause: error })
    : new Error(message);

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * A record fetch failure that retrying won't fix: the fetch itself worked,
 * but what came back can never become a usable record (e.g. its value isn't
 * an object). Caches hold these as long as successes instead of applying
 * their short retry floor.
 */
export class DefinitiveRecordError extends Error {}

export const isDefinitiveRecordFailure = (error: unknown): boolean =>
  error instanceof DefinitiveRecordError ||
  error instanceof ComAtprotoRepoGetRecord.RecordNotFoundError;

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

/**
 * Resolve a loader's `filter`/`groupBy`/`transform` options into the
 * `AtProtoRecordCallbacks` used by the pipeline.
 */
export const resolveRecordCallbacks = <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Data extends Record<string, unknown>,
  Entry extends { id: string; data: Data },
>(
  sources: readonly AtProtoLoaderSource<unknown>[],
  options: AtProtoRecordFilterOptions<Sources> &
    AtProtoTransformOptions<Sources, Entry>,
): AtProtoRecordCallbacks<Sources, Entry> => {
  if (options.groupBy) {
    return {
      filter: options.filter,
      groupBy: options.groupBy,
      transform: options.transform,
    };
  }

  // The fallback only runs when no custom `transform` was provided, which
  // means `Entry` is just `{ id: string; data: Data }`. TS can't narrow the
  // generic per branch, hence the cast.
  const fallbackTransform = (sources.length > 1
    ? toNamespacedEntry<Data>
    : toRkeyEntry<Data>) as unknown as AtProtoRecordTransform<Sources, Entry>;
  return {
    filter: options.filter,
    transform: options.transform ?? fallbackTransform,
  };
};
