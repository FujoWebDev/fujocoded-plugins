import { IdResolver } from "@atproto/identity";

import { TtlCache } from "./ttl.ts";
import type { AtProtoRecordRepo, RecordValue } from "../types.ts";
import { isDefinitiveRecordFailure } from "../utils.ts";

export const IDENTITY_CACHE_TTL = 60 * 60 * 1_000;
export const IDENTITY_RETRY_TTL = 30 * 1_000;

export const HYDRATED_RECORD_CACHE_TTL = 5 * 60_000;
/**
 * Transient failures (network errors, 5xx) retry after this floor.
 * Definitive ones (e.g. the PDS said the record doesn't exist, or its value can
 * never parse) are held as long as successes, since retrying can't help.
 */
export const HYDRATED_RECORD_RETRY_TTL = 5_000;
export const HYDRATED_RECORD_NOT_FOUND_TTL = HYDRATED_RECORD_CACHE_TTL;

/**
 * A fixed 20,000-entry ceiling covers a large active set of hydrated
 * references while bounding arbitrary record JSON to a predictable order of
 * magnitude. There is no consumer evidence that this needs public tuning; if
 * real workloads show cache churn, revisit the fixed value with that evidence.
 */
export const HYDRATED_RECORD_CACHE_MAX_ENTRIES = 20_000;

/**
 * The shared state a loader reads through: resolved identities and hydrated
 * records, plus the `IdResolver` itself and its internal DID/handle caches.
 */
export interface AtProtoCache {
  identity: TtlCache<string, AtProtoRecordRepo>;
  hydratedRecords: TtlCache<
    string,
    { value: RecordValue; repo: AtProtoRecordRepo }
  >;
  resolver: IdResolver;
  /**
   * Tells `whenIdle` about fire-and-forget work, like a background refresh
   * nobody awaits.
   *
   * Call it for promises with no awaiter: since nothing keeps the process alive
   * for them, they can be killed mid-flight by a serverless runtime. Pairing
   * this with awaiting `whenIdle` before shutdown ensures that all work that
   * was started has settled, so the process doesn't exit while a background
   * refresh is still in progress.
   *
   * When called on awaited promises, this call just makes `whenIdle` stall on
   * other callers' in-flight requests, which will be settled anyway on their
   * own.
   */
  onRefresh: (refresh: Promise<unknown>) => void;
  /**
   * Resolves once every background data refresh has settled, including those
   * started while waiting. Never rejects: failed refreshes already report
   * through their own error handling.
   *
   * Await this before asserting on request counts in tests, or before letting a
   * serverless runtime freeze the process.
   */
  whenIdle: () => Promise<void>;
}

export const createAtProtoCache = (): AtProtoCache => {
  const pendingRefreshes = new Set<Promise<unknown>>();

  return {
    identity: new TtlCache({
      successTtl: IDENTITY_CACHE_TTL,
      failureTtl: IDENTITY_RETRY_TTL,
    }),
    hydratedRecords: new TtlCache({
      successTtl: HYDRATED_RECORD_CACHE_TTL,
      failureTtl: (error) =>
        isDefinitiveRecordFailure(error)
          ? HYDRATED_RECORD_NOT_FOUND_TTL
          : HYDRATED_RECORD_RETRY_TTL,
      maxEntries: HYDRATED_RECORD_CACHE_MAX_ENTRIES,
    }),
    resolver: new IdResolver({}),
    onRefresh: (refresh) => {
      // A refresh's failure is already reported through its own onError
      // handling before the promise reaches us, so all we track here is *when*
      // it settles. Without the catch, we'd have an unhandled rejection if the
      // refresh fails, which is not what we want.
      const settled = refresh.catch(() => {});
      pendingRefreshes.add(settled);
      void settled.finally(() => pendingRefreshes.delete(settled));
    },
    whenIdle: async () => {
      //We must wait for all refreshes to settle, including any that
      // start while waiting.
      while (pendingRefreshes.size > 0) {
        await Promise.allSettled(pendingRefreshes);
      }
    },
  };
};

/**
 * Loaders use this immutable default when callers do not provide their own
 * cache. Sharing this instance makes caches span every default loader in the
 * process.
 */
export const defaultAtProtoCache = createAtProtoCache();
