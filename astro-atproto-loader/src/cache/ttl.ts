export interface TtlCacheOptions {
  successTtl: number;
  /**
   * How long rejections stay cached before a retry is allowed. The function
   * form receives the rejection error, so different failure kinds can get
   * different TTLs.
   */
  failureTtl: number | ((error: unknown) => number);
  maxEntries?: number;
}

type CacheEntry<Value> =
  | { status: "success"; value: Value; expiresAt: number }
  | { status: "failure"; error: unknown; expiresAt: number };

export class TtlCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();
  private readonly inFlight = new Map<Key, Promise<Value>>();
  private readonly successTtl: number;
  private readonly failureTtl: number | ((error: unknown) => number);
  private readonly maxEntries: number | undefined;
  private generation = 0;

  constructor({ successTtl, failureTtl, maxEntries }: TtlCacheOptions) {
    if (Number.isNaN(successTtl) || successTtl < 0) {
      throw new RangeError("successTtl must be a non-negative number");
    }
    if (
      typeof failureTtl === "number" &&
      (Number.isNaN(failureTtl) || failureTtl < 0)
    ) {
      throw new RangeError("failureTtl must be a non-negative number");
    }
    if (
      maxEntries !== undefined &&
      (!Number.isSafeInteger(maxEntries) || maxEntries < 0)
    ) {
      throw new RangeError("maxEntries must be a non-negative safe integer");
    }

    this.successTtl = successTtl;
    this.failureTtl = failureTtl;
    this.maxEntries = maxEntries;
  }

  get(key: Key, load: () => Promise<Value>): Promise<Value> {
    const entry = this.entries.get(key);

    if (entry && entry.expiresAt > Date.now()) {
      this.touch(key, entry);
      return entry.status === "success"
        ? Promise.resolve(entry.value)
        : Promise.reject(entry.error);
    }

    if (entry) {
      this.entries.delete(key);
    }

    const existingRequest = this.inFlight.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    const generation = this.generation;
    const request = Promise.resolve().then(load);
    const pending = request
      .then(
        (value) => {
          if (
            this.generation === generation &&
            this.inFlight.get(key) === pending
          ) {
            this.setEntry(key, {
              status: "success",
              value,
              expiresAt: Date.now() + this.successTtl,
            });
          }

          return value;
        },
        (error: unknown) => {
          if (
            this.generation === generation &&
            this.inFlight.get(key) === pending
          ) {
            this.setEntry(key, {
              status: "failure",
              error,
              expiresAt: Date.now() + this.failureTtlFor(error),
            });
          }

          throw error;
        },
      )
      .finally(() => {
        // Delete the in-flight request only if it is still the same one
        // we created, to avoid deleting a newer request that was started
        // after this one.
        if (this.inFlight.get(key) === pending) {
          this.inFlight.delete(key);
        }
      });

    this.inFlight.set(key, pending);
    return pending;
  }

  private failureTtlFor(error: unknown): number {
    return typeof this.failureTtl === "function"
      ? this.failureTtl(error)
      : this.failureTtl;
  }

  private touch(key: Key, entry: CacheEntry<Value>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private setEntry(key: Key, entry: CacheEntry<Value>): void {
    this.touch(key, entry);

    if (this.maxEntries === undefined) {
      return;
    }

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        return;
      }
      this.entries.delete(oldest.value);
    }
  }

  reset(): void {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }
}
