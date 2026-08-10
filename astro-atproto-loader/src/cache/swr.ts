export interface SwrCacheOptions<Snapshot> {
  /**
   * Fetches fresh data. Errors are caught and passed to `onError`; the cache
   * keeps serving stale data until the next refresh succeeds.
   */
  fetch: () => Promise<Snapshot>;
  /**
   * Milliseconds after which cached data is considered stale. A read past the
   * TTL still returns the cached value synchronously but triggers a background
   * refresh.
   */
  ttl: number;
  /**
   * Minimum milliseconds between refresh attempts after a failure.
   */
  failureTtl: number;
  onError: (error: unknown) => void;
  /**
   * Receives every refresh this cache starts, so the caller can wait for
   * background work to settle. The first "cold" load is awaited by the caller
   * and is deliberately not reported here.
   */
  onRefresh: (refresh: Promise<unknown>) => void;
}

/**
 * A small stale-while-revalidate cache for one source's records.
 *
 * The first read awaits that source's initial fetch. Later reads return its
 * cached records immediately and start a background refresh when they are
 * older than `ttl`. Concurrent refreshes for the source share one in-flight
 * promise. A warm refresh failure preserves the source's last successful
 * records, reports the error through `onError`, and observes `failureTtl`
 * before trying again. A cold failure rejects; the caller decides what a
 * failed first load means.
 */
export const createSwrCache = <Snapshot>({
  fetch,
  ttl,
  failureTtl,
  onError,
  onRefresh,
}: SwrCacheOptions<Snapshot>) => {
  let cached: { value: Snapshot } | undefined;
  let cacheTime = 0;
  let failureTime: number | undefined;
  let refreshPromise: Promise<Snapshot> | undefined;

  const triggerRefresh = () => {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const value = await fetch();
        cached = { value };
        cacheTime = Date.now();
        failureTime = undefined;
        return value;
      } catch (error) {
        failureTime = Date.now();
        onError(error);
        if (!cached) {
          throw error;
        }
        return cached.value;
      } finally {
        refreshPromise = undefined;
      }
    })();

    return refreshPromise;
  };

  const read = async () => {
    if (!cached) {
      return triggerRefresh();
    }

    const now = Date.now();
    const retryFloorElapsed =
      failureTime === undefined || now - failureTime >= failureTtl;

    if (now - cacheTime > ttl && retryFloorElapsed) {
      onRefresh(triggerRefresh());
    }

    return cached.value;
  };

  return read;
};
