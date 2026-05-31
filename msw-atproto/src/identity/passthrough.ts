import { http, passthrough, type HttpHandler } from "msw";

import type { DnsPromisesModule, ImportActualDnsPromises } from "../dns.ts";
import { createDnsStub } from "../dns.ts";

export type CreateIdentityPassthroughOptions = {
  /**
   * Returns `true` for handles that should be left alone end-to-end: their
   * `_atproto.<handle>` DNS query runs against real DNS, and their
   * `https://<handle>/.well-known/atproto-did` HTTP follow-up is passed
   * through MSW to the real server. Handles for which this returns `false`
   * (the default) are intercepted: DNS fails with `ENODATA` and the
   * `.well-known` request must be answered by an MSW handler.
   *
   * Use this when a single test mixes mocked accounts with one or two real
   * handles (e.g. a real `*.bsky.social` while everything else is fake):
   *
   * ```ts
   * createIdentityPassthrough({
   *   shouldPassthrough: (handle) => handle.endsWith(".bsky.social"),
   * });
   * ```
   */
  shouldPassthrough?: (handle: string) => boolean;
};

/**
 * Pairs the DNS bypass and the `.well-known/atproto-did` HTTP passthrough
 * under a single predicate. A handle is either fully mocked (DNS returns
 * `ENODATA`, MSW expects a handler) or fully real (real DNS, real HTTP);
 * the two layers always move together.
 */
export const createIdentityPassthrough = ({
  shouldPassthrough = () => false,
}: CreateIdentityPassthroughOptions = {}): {
  /**
   * Vitest-friendly DNS module factory. Pass to `vi.mock("node:dns/promises")`:
   *
   * ```ts
   * vi.mock("node:dns/promises", passthrough.dnsMock);
   * ```
   */
  dnsMock: (
    importActual: ImportActualDnsPromises,
  ) => Promise<DnsPromisesModule>;
  /**
   * MSW handlers that passthrough `.well-known/atproto-did` for handles the
   * predicate selects. Register before any per-test repo handlers so
   * mocked handles still match first:
   *
   * ```ts
   * server.use(...passthrough.handlers);
   * ```
   */
  handlers: HttpHandler[];
} => ({
  dnsMock: async (importActual) =>
    createDnsStub(await importActual(), {
      shouldInterceptHandle: (handle) => !shouldPassthrough(handle),
    }),
  handlers: [
    http.get("https://*/.well-known/atproto-did", ({ request }) => {
      const { hostname } = new URL(request.url);
      if (shouldPassthrough(hostname)) return passthrough();
      // Fall through to other handlers (per-test fake repo, etc.).
      return;
    }),
  ],
});
