import { AtUri } from "@atproto/api";
import type { DidString } from "@atproto/syntax";

import { getPds } from "../client/identity.ts";
import { getSingleRecord, isRecordValue } from "../client/records.ts";
import type { AtProtoRecordRepo, FetchRecord, RecordValue } from "../types.ts";
import { getErrorMessage } from "../utils.ts";

type FetchedRecord = { value: RecordValue; repo: AtProtoRecordRepo };

/**
 * Build a per-cycle `fetchRecord` helper.
 *
 * Each instance keeps an in-memory cache that maps AT-URIs to in-flight
 * fetch promises. Concurrent callers asking for the same URI within one
 * pipeline cycle share a single network request.
 *
 * Each successful resolution carries the fetched record's owning DID and
 * PDS alongside its `value`, so callers can build blob URLs for the
 * hydrated record without re-resolving identity.
 *
 * All failures simply return `null`, but each one prints a distinct
 * `console.warn` for debugging.
 */
export const createFetchRecord = (): FetchRecord => {
  const cache = new Map<string, Promise<FetchedRecord | null>>();

  const fetchBase = async (atUri: string): Promise<FetchedRecord | null> => {
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
      const [data, pds] = await Promise.all([
        getSingleRecord(
          { repo: parsed.host, collection: parsed.collection },
          parsed.rkey,
        ),
        getPds(parsed.host),
      ]);
      if (!isRecordValue(data.value)) {
        console.warn(
          `[atproto-loader] fetchRecord: record value is not an object at ${atUri}`,
        );
        return null;
      }
      return {
        value: data.value,
        repo: { did: parsed.host as DidString, pds },
      };
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
  }): Promise<{ value: Parsed; repo: AtProtoRecordRepo } | null> => {
    let pending = cache.get(atUri);
    if (!pending) {
      pending = fetchBase(atUri);
      cache.set(atUri, pending);
    }
    const fetched = await pending;
    if (fetched === null) return null;
    if (!parse) return fetched as { value: Parsed; repo: AtProtoRecordRepo };
    try {
      return { value: parse(fetched.value), repo: fetched.repo };
    } catch (error) {
      console.warn(
        `[atproto-loader] fetchRecord: caller parse threw for ${atUri}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  };
};
