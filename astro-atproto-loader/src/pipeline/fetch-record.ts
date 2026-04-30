import { AtUri } from "@atproto/api";

import { getSingleRecord, isRecordValue } from "../client/records.ts";
import type { FetchRecord, RecordValue } from "../types.ts";
import { getErrorMessage } from "../utils.ts";

/**
 * Build a per-cycle `fetchRecord` helper.
 *
 * Each instance keeps an in-memory cache that maps AT-URIs to in-flight
 * fetch promises. Concurrent callers asking for the same URI within one
 * pipeline cycle share a single network request.
 *
 * All failures simply return `null`, but each one prints a distinct
 * `console.warn` for debugging.
 */
export const createFetchRecord = (): FetchRecord => {
  const cache = new Map<string, Promise<RecordValue | null>>();

  const fetchBase = async (atUri: string): Promise<RecordValue | null> => {
    let parsed: AtUri;
    try {
      parsed = new AtUri(atUri);
    } catch (error) {
      console.warn(
        `[atproto-loader] fetchRecord: invalid AT-URI ${atUri}: ${getErrorMessage(error)}`,
      );
      return null;
    }

    if (!parsed.host || !parsed.collection || !parsed.rkey) {
      console.warn(
        `[atproto-loader] fetchRecord: AT-URI missing host/collection/rkey: ${atUri}`,
      );
      return null;
    }

    try {
      const data = await getSingleRecord(
        { repo: parsed.host, collection: parsed.collection },
        parsed.rkey,
      );
      if (!isRecordValue(data.value)) {
        console.warn(
          `[atproto-loader] fetchRecord: record value is not an object at ${atUri}`,
        );
        return null;
      }
      return data.value;
    } catch (error) {
      console.warn(
        `[atproto-loader] fetchRecord: getRecord failed for ${atUri}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  };

  return async <Parsed = RecordValue>({
    atUri,
    parse,
  }: {
    atUri: string;
    parse?: (value: unknown) => Parsed;
  }): Promise<Parsed | null> => {
    let pending = cache.get(atUri);
    if (!pending) {
      pending = fetchBase(atUri);
      cache.set(atUri, pending);
    }
    const value = await pending;
    if (value === null) return null;
    if (!parse) return value as Parsed;
    try {
      return parse(value);
    } catch (error) {
      console.warn(
        `[atproto-loader] fetchRecord: caller parse threw for ${atUri}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  };
};
