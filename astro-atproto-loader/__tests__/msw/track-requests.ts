type RequestStartListener = (info: { request: Request }) => void;

export type XrpcRequestTracker = {
  /** Every XRPC request seen since tracking started, in arrival order. */
  requests: { origin: string; method: string; url: URL }[];
  /** How many requests hit `method` on the PDS at `pds` so far. */
  count: (pds: string, method: string) => number;
};

/**
 * Records every XRPC request the MSW server intercepts, so tests can assert
 * how often an endpoint was hit without hand-rolling counting handlers.
 *
 * Use this only where the request count IS the behavior under test (refresh
 * throttling, request dedupe); prefer asserting on returned values otherwise.
 * The listener registered here is cleaned up by setup.ts's
 * `server.events.removeAllListeners()` between tests.
 */
export const trackXrpcRequests = (server: {
  events: { on(event: "request:start", listener: RequestStartListener): void };
}): XrpcRequestTracker => {
  const requests: XrpcRequestTracker["requests"] = [];

  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const method = /^\/xrpc\/(.+)$/.exec(url.pathname)?.[1];
    if (method) {
      requests.push({ origin: url.origin, method, url });
    }
  });

  return {
    requests,
    count: (pds, method) => {
      const origin = new URL(pds).origin;
      return requests.filter(
        (entry) => entry.origin === origin && entry.method === method,
      ).length;
    },
  };
};
