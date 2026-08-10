import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "../../src/cache/ttl.ts";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([-1, Number.NaN])("rejects invalid success TTL %s", (successTtl) => {
    expect(() => new TtlCache({ successTtl, failureTtl: 100 })).toThrowError(
      "successTtl must be a non-negative number",
    );
  });

  it.each([-1, Number.NaN])("rejects invalid failure TTL %s", (failureTtl) => {
    expect(() => new TtlCache({ successTtl: 1_000, failureTtl })).toThrowError(
      "failureTtl must be a non-negative number",
    );
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid max-entry policy %s",
    (maxEntries) => {
      expect(
        () =>
          new TtlCache({
            successTtl: 1_000,
            failureTtl: 100,
            maxEntries,
          }),
      ).toThrowError("maxEntries must be a non-negative safe integer");
    },
  );

  it("serves a successful entry until its stamped expiry, then refetches", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: 100,
    });
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    await expect(cache.get("key", load)).resolves.toBe("first");

    vi.advanceTimersByTime(999);
    await expect(cache.get("key", load)).resolves.toBe("first");
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(cache.get("key", load)).resolves.toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("throttles a failed lookup until the failure retry floor elapses", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: 100,
    });
    const failure = new Error("temporarily unavailable");
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce("recovered");

    await expect(cache.get("key", load)).rejects.toBe(failure);

    vi.advanceTimersByTime(99);
    await expect(cache.get("key", load)).rejects.toBe(failure);
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(cache.get("key", load)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("lets the failure TTL vary by rejection error", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: (error) => (error instanceof RangeError ? 500 : 100),
    });
    const definitive = new RangeError("permanently gone");
    const transient = new Error("temporarily unavailable");
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(definitive)
      .mockRejectedValueOnce(transient)
      .mockResolvedValue("recovered");

    await expect(cache.get("definitive", load)).rejects.toBe(definitive);
    await expect(cache.get("transient", load)).rejects.toBe(transient);

    vi.advanceTimersByTime(100);
    await expect(cache.get("definitive", load)).rejects.toBe(definitive);
    await expect(cache.get("transient", load)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(400);
    await expect(cache.get("definitive", load)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("uses one construction-owned policy for every key", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 100,
      failureTtl: 10,
    });
    const load = vi.fn(async (key: string) => key);

    await cache.get("first", () => load("first"));
    await cache.get("second", () => load("second"));

    vi.advanceTimersByTime(99);
    await cache.get("first", () => load("first"));
    await cache.get("second", () => load("second"));
    expect(load).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1);
    await cache.get("first", () => load("first"));
    await cache.get("second", () => load("second"));
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("deduplicates concurrent reads for the same key", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: 100,
    });
    let resolveLoad: ((value: string) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = cache.get("key", load);
    const second = cache.get("key", load);
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    resolveLoad?.("value");
    await expect(Promise.all([first, second])).resolves.toEqual([
      "value",
      "value",
    ]);
  });

  it("does not let an in-flight pre-reset generation corrupt its replacement", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: 100,
    });
    let resolveOld: ((value: string) => void) | undefined;
    const oldLoad = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOld = resolve;
        }),
    );
    const replacementLoad = vi.fn(async () => "replacement");
    const unexpectedReload = vi.fn(async () => "unexpected");

    const oldRequest = cache.get("key", oldLoad);
    await Promise.resolve();
    expect(oldLoad).toHaveBeenCalledTimes(1);

    cache.reset();
    await expect(cache.get("key", replacementLoad)).resolves.toBe(
      "replacement",
    );

    resolveOld?.("old");
    await expect(oldRequest).resolves.toBe("old");
    await expect(cache.get("key", unexpectedReload)).resolves.toBe(
      "replacement",
    );

    expect(replacementLoad).toHaveBeenCalledTimes(1);
    expect(unexpectedReload).not.toHaveBeenCalled();
  });
});

describe("TtlCache LRU bound", () => {
  it("never retains more entries than its configured ceiling", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: 100,
      maxEntries: 2,
    });
    const load = vi.fn(async (key: string) => key);
    const get = (key: string) => cache.get(key, () => load(key));

    await get("first");
    await get("second");
    await get("third");
    await get("second");
    await get("third");
    await get("first");

    expect(load).toHaveBeenCalledTimes(4);
  });

  it("refreshes recency on a cache hit and evicts the least recently read entry", async () => {
    const cache = new TtlCache<string, string>({
      successTtl: 1_000,
      failureTtl: 100,
      maxEntries: 2,
    });
    const loads = new Map<string, number>();
    const get = (key: string) =>
      cache.get(key, async () => {
        loads.set(key, (loads.get(key) ?? 0) + 1);
        return key;
      });

    await get("first");
    await get("second");
    await get("first");
    await get("third");

    await get("first");
    await get("second");

    expect(loads.get("first")).toBe(1);
    expect(loads.get("second")).toBe(2);
    expect(loads.get("third")).toBe(1);
  });
});
