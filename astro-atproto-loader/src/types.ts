import type { ComAtprotoRepoListRecords } from "@atproto/api";
import type { DidString, HandleString } from "@atproto/syntax";

export type RecordValue = ComAtprotoRepoListRecords.Record["value"];
export type MaybePromise<Value> = Value | Promise<Value>;

/**
 * One PDS repo + collection to read from.
 *
 * `Raw` is the parsed record shape. It defaults to the raw `RecordValue` map
 * and widens to whatever `parseRecord` returns when one is provided, so a
 * heterogeneous `sources: [...]` array stays type-narrowed by `collection`
 * inside the callbacks (see `ArgFor` below).
 */
export interface AtProtoLoaderSource<Raw = RecordValue> {
  /** The repo whose records should be loaded. May be either a DID or a handle. */
  repo: string;
  /** The AtProto collection NSID to read from, like `app.bsky.feed.post`. */
  collection: string;
  /**
   * Optional per-record schema check, run once against each raw `value` before
   * `filter`. Use this for `$parse`-style lexicon validation. If it throws,
   * that single record is dropped with a warning — the rest of the source
   * keeps loading and `onSourceError` is _not_ triggered.
   *
   * When omitted, records pass through unchecked as the raw `RecordValue` map
   * and any shape validation is left to `filter`, `transform`, or the Astro
   * collection schema.
   */
  parseRecord?: (value: unknown) => Raw;
  /**
   * Cap on how many records to load from this source.
   *
   * - Omitted => one page of up to 100 records, no cursor walk (default)
   * - `number` => stop at that count, page size is `min(limit, 100)`
   * - `'all'` => walk every cursor, 100 records per page
   *
   * Records rejected by `filter` do not count toward the limit.
   */
  limit?: number | "all";
  /**
   * Hard cap on the number of `listRecords` pages fetched, regardless of how
   * many records survive `filter`.
   *
   * - `limit` omitted or a number => defaults to `1`
   * - `limit: 'all'` => defaults to `Infinity`
   */
  maxPages?: number;
}

/**
 * Identifier for the repo this record lives in.
 *
 * `did` is always set (resolved from the record's AT-URI).
 * `handle` is set only when the source config provided a handle for this
 * repo — the loader never reverse-resolves DID → handle, so callers that
 * passed `repo: "did:..."` will see `handle: undefined`.
 */
export interface AtProtoRecordRepo {
  did: DidString;
  handle?: HandleString;
}

export interface AtProtoRecordContext {
  repo: AtProtoRecordRepo;
  collection: string;
  rkey: string;
  uri: string;
  cid?: string;
}

/**
 * Fetch a single record by AT-URI from any public PDS.
 *
 * Concurrent callers for the same URI within one pipeline cycle share a
 * single network hop. Calling `fetchRecord({ atUri })` from many `transform`
 * or `filter` callbacks for the same target only hits the network once.
 *
 * Returns `null` on:
 *
 * - Malformed AT-URI
 * - PDS that can't be resolved
 * - 404 from the PDS
 * - Record whose value isn't an object
 * - Caller-provided `parse` that threw
 *
 * Each failure mode logs a distinct warning, so callers can tell which thing
 * went wrong from the console.
 */
export type FetchRecord = <Parsed = RecordValue>(
  args: {
    atUri: string;
    parse?: (value: unknown) => Parsed;
  },
) => Promise<Parsed | null>;

/**
 * The bundle of args passed to each `filter` and `transform` callback for a
 * single record. `Raw` is the value's parsed type — it comes from the
 * source's `parseRecord` return type when one is provided, and otherwise
 * defaults to the raw `RecordValue` map.
 */
export interface AtProtoRecordCallbackArgs<
  Raw = RecordValue,
> extends AtProtoRecordContext {
  value: Raw;
  fetchRecord: FetchRecord;
}

/**
 * Type-level helper that pairs each source's `collection` literal with the
 * matching `value` type. For a source with `collection: "foo"` and
 * `parseRecord: (unknown) => Value`, this produces callback args where
 * `collection` is `"foo"` and `value` is `Value`. Sources without `parseRecord`
 * fall back to `RecordValue`. Unioned across `Sources` (see `ArgsUnion`),
 * this gives callbacks a discriminated union keyed on `collection`.
 */
export type ArgFor<S> = S extends { collection: infer C extends string }
  ? AtProtoRecordContext & {
      collection: C;
      value: S extends { parseRecord: (value: unknown) => infer Value }
        ? Value
        : RecordValue;
      fetchRecord: FetchRecord;
    }
  : never;

export type ArgsUnion<Sources extends readonly unknown[]> = {
  [K in keyof Sources]: ArgFor<Sources[K]>;
}[number];

export interface AtProtoRecordFilterOptions<
  Sources extends readonly AtProtoLoaderSource<unknown>[] =
    readonly AtProtoLoaderSource<unknown>[],
> {
  /** Skip records before they are transformed into Astro entries. */
  filter?: (args: ArgsUnion<Sources>) => MaybePromise<boolean>;
}

/**
 * Convert a per-record args bundle into an Astro entry. Returning `null` or
 * `undefined` drops the record — handy when a secondary hydration check or
 * an inline schema parse decides the entry shouldn't ship.
 */
export type AtProtoRecordTransform<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry,
> = (args: ArgsUnion<Sources>) => MaybePromise<Entry | null | undefined>;

/**
 * Group records across sources under a caller-chosen string key, before
 * `transform` runs. Every filtered record must return a key; records that
 * share a key are passed to a single grouped `transform` call in source
 * declaration order.
 *
 * Use `filter` to exclude records before grouping, or return a unique value
 * like `uri` for records that shouldn't merge with anything else.
 *
 * This is meant as a bridge: it lets a multi-repo collection emit the same
 * shape a future AppView method would, rather than acting as a long-term
 * aggregation strategy.
 */
export type AtProtoRecordGroupBy<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
> = (args: ArgsUnion<Sources>) => MaybePromise<string>;

export interface AtProtoRecordGroupTransformArgs<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
> {
  /** The key returned from `groupBy`. */
  key: string;
  /** All filtered records that returned this key, in source declaration order. */
  records: ArgsUnion<Sources>[];
  /** Shared per-cycle record hydrator, same as the per-record callback helper. */
  fetchRecord: FetchRecord;
}

export type AtProtoRecordGroupTransform<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry,
> = (
  args: AtProtoRecordGroupTransformArgs<Sources>,
) => MaybePromise<Entry | null | undefined>;

export type AtProtoRecordCallbacks<
  Sources extends readonly AtProtoLoaderSource<unknown>[],
  Entry,
> = AtProtoRecordFilterOptions<Sources> &
  (
    | {
        groupBy?: undefined;
        transform: AtProtoRecordTransform<Sources, Entry>;
      }
    | {
        groupBy: AtProtoRecordGroupBy<Sources>;
        transform: AtProtoRecordGroupTransform<Sources, Entry>;
      }
  );

/**
 * What the pipeline should do when one source in a multi-source load fails.
 *
 * - `'skip'` warns and drops that source's contribution, letting the rest of
 *   the load continue.
 * - `'throw'` rethrows immediately so the static loader can fail the build,
 *   or so the live loader's stale-while-revalidate cache holds onto the last
 *   good snapshot until the next refresh.
 * - A function gets the error and source and returns one of the two, for
 *   case-by-case decisions.
 *
 * Once the pipeline starts skipping errors, if _every_ remaining source ends
 * up failing it throws an `AggregateError` so the failure isn't swallowed
 * silently. (When the policy is `'throw'`, the first error fails the load
 * right away, so the aggregate path doesn't apply.)
 */
export type OnSourceError =
  | "throw"
  | "skip"
  | ((error: unknown, source: AtProtoLoaderSource<unknown>) => "throw" | "skip");

/**
 * Structural extraction of a Zod schema's input type. Avoids depending on a
 * specific zod version.
 */
export type SchemaInput<S> = S extends { readonly _input: infer Input }
  ? Input extends Record<string, unknown>
    ? Input
    : never
  : never;

export type SchemaLike = { readonly _input: Record<string, unknown> };