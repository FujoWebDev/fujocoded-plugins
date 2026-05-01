import {
  isRecordValue,
  listRecordsPage,
  toRecordContext,
} from "../client/records.ts";
import type {
  ArgsUnion,
  AtProtoLoaderSource,
  AtProtoRecordCallbackArgs,
  AtProtoRecordFilterOptions,
  FetchRecord,
} from "../types.ts";
import { getErrorMessage } from "../utils.ts";

const DEFAULT_PAGE_SIZE = 100;

interface RecordsFetchWindow {
  /** How many filtered records to collect at most. `undefined` means no cap. */
  maxRecords: number | undefined;
  /** Page size used for each `listRecords` call. */
  pageSize: number;
  /** Hard cap on raw pages fetched, regardless of how many survive filtering. */
  maxPages: number;
}

const resolveRecordsFetchWindow = (
  source: AtProtoLoaderSource<unknown>,
): RecordsFetchWindow => {
  const { limit, maxPages } = source;

  if (limit === undefined) {
    return {
      maxRecords: DEFAULT_PAGE_SIZE,
      pageSize: DEFAULT_PAGE_SIZE,
      maxPages: maxPages ?? 1,
    };
  }

  if (limit === "all") {
    return {
      maxRecords: undefined,
      pageSize: DEFAULT_PAGE_SIZE,
      maxPages: maxPages ?? Infinity,
    };
  }

  return {
    maxRecords: limit,
    pageSize: Math.min(limit, DEFAULT_PAGE_SIZE),
    maxPages: maxPages ?? 1,
  };
};

/**
 * Fetch, parse, and filter one source into a flat list of callback args.
 *
 * Each record goes through the same path:
 *
 * - A `listRecords` page is fetched
 * - Every record is validated
 * - `parseRecord` (if provided) => on error it drops just that record with a
 *   warning
 * - `filter` (if provided) => drops the record if `false` is returned
 *
 * `maxPages` caps how many `listRecords` pages this can ever pull, while
 * `maxRecords` caps how many survivors we collect. When either runs out,
 * the loop ends.
 */
export const fetchFromSource = async <
  Sources extends readonly AtProtoLoaderSource<unknown>[],
>(
  source: AtProtoLoaderSource<unknown>,
  callbacks: AtProtoRecordFilterOptions<Sources>,
  fetchRecord: FetchRecord,
): Promise<AtProtoRecordCallbackArgs<unknown>[]> => {
  const window = resolveRecordsFetchWindow(source);
  const collected: AtProtoRecordCallbackArgs<unknown>[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    if (pageCount >= window.maxPages) break;
    if (
      window.maxRecords !== undefined &&
      collected.length >= window.maxRecords
    )
      break;

    const remaining =
      window.maxRecords !== undefined
        ? window.maxRecords - collected.length
        : undefined;
    const thisPageSize =
      remaining !== undefined
        ? Math.min(remaining, window.pageSize)
        : window.pageSize;

    const data = await listRecordsPage(source, {
      limit: thisPageSize,
      cursor,
    });
    pageCount++;

    for (const record of data.records) {
      if (!isRecordValue(record.value)) continue;

      const context = await toRecordContext(source, record);

      let value: unknown = record.value;
      if (source.parseRecord) {
        try {
          value = source.parseRecord(record.value);
        } catch (error) {
          console.warn(
            `[atproto-loader] parseRecord threw for ${source.repo}/${source.collection}/${context.rkey}: ${getErrorMessage(error)}`,
          );
          continue;
        }
      }

      const args: AtProtoRecordCallbackArgs<unknown> = {
        ...context,
        value,
        fetchRecord,
      };

      if (
        callbacks.filter &&
        !(await callbacks.filter(args as ArgsUnion<Sources>))
      ) {
        continue;
      }

      collected.push(args);

      if (
        window.maxRecords !== undefined &&
        collected.length >= window.maxRecords
      )
        break;
    }

    cursor = data.cursor;
  } while (cursor);

  return collected;
};
