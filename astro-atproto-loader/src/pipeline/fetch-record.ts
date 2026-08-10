import { AtUri } from "@atproto/api";
import type { DidString } from "@atproto/syntax";

import { getPds } from "../client/identity.ts";
import { getSingleRecord, isRecordValue } from "../client/records.ts";
import type { AtProtoCache } from "../cache/index.ts";
import type { AtProtoRecordRepo, FetchRecord, RecordValue } from "../types.ts";
import { DefinitiveRecordError, getErrorMessage } from "../utils.ts";

/**
 * Build a `fetchRecord` helper.
 *
 * Each helper reads through a shared cache that maps AT-URIs to fetched
 * records and in-flight fetch promises. Concurrent callers asking for the
 * same URI share a single network request, and completed records are
 * reused across pipeline cycles and collections.
 *
 * Each successful resolution carries the fetched record's owning DID and
 * PDS alongside its `value`, so callers can build blob URLs for the
 * hydrated record without re-resolving identity.
 *
 * All failures simply return `null`, but each one prints a distinct
 * `console.warn` for debugging. Internally the cache sees them as
 * rejections so it can apply a shorter retry floor.
 */
export const createFetchRecord = (caches: AtProtoCache): FetchRecord => {
  const fetchBase = async (
    atUri: string,
    parsed: AtUri,
  ): Promise<{ value: RecordValue; repo: AtProtoRecordRepo }> => {
    const [data, pds] = await Promise.all([
      getSingleRecord(
        { repo: parsed.host, collection: parsed.collection },
        parsed.rkey,
        caches,
      ),
      getPds(parsed.host, caches),
    ]).catch((error: unknown) => {
      console.warn(
        `[atproto-loader] fetchRecord: getRecord failed for ${atUri}: ${getErrorMessage(error)}`,
      );
      throw error;
    });

    if (!isRecordValue(data.value)) {
      const error = new DefinitiveRecordError(
        `Record value is not an object at ${atUri}`,
      );
      console.warn(
        `[atproto-loader] fetchRecord: record value is not an object at ${atUri}`,
      );
      throw error;
    }

    return {
      value: data.value,
      repo: { did: parsed.host as DidString, pds },
    };
  };

  return async <ParsedValue = RecordValue>({
    atUri,
    parse,
  }: {
    atUri: string;
    parse?: (value: unknown) => ParsedValue;
  }): Promise<{ value: ParsedValue; repo: AtProtoRecordRepo } | null> => {
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

    let fetched: { value: RecordValue; repo: AtProtoRecordRepo };
    try {
      fetched = await caches.hydratedRecords.get(atUri, () =>
        fetchBase(atUri, parsed),
      );
    } catch {
      return null;
    }

    if (!parse)
      return fetched as { value: ParsedValue; repo: AtProtoRecordRepo };
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
