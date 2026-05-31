import { http, type HttpHandler } from "msw";

export type XrpcRouteContext<Parsed = unknown> = {
  request: Request;
  url: URL;
  parsed?: Parsed;
};

/**
 * Defines one XRPC MSW route on a PDS.
 *
 * The handler first checks origin and path, then lets the route-specific
 * matcher inspect query params or JSON body. Returning `false` from the matcher
 * lets another handler for the same PDS and endpoint answer instead.
 */
export const defineXrpcRoute = <Parsed = unknown>({
  pds,
  method,
  httpMethod = "get",
  matches,
  resolve,
}: {
  pds: string;
  method: string;
  httpMethod?: "get" | "post";
  matches?: (context: XrpcRouteContext<Parsed>) => boolean | Promise<boolean>;
  resolve: (context: XrpcRouteContext<Parsed>) => Response | Promise<Response>;
}): HttpHandler => {
  const matchedContexts = new WeakMap<Request, XrpcRouteContext<Parsed>>();

  return http[httpMethod](
    async ({ request }) => {
      const url = new URL(request.url);
      const endpoint = new URL(`/xrpc/${method}`, pds);

      if (
        url.origin !== endpoint.origin ||
        url.pathname !== endpoint.pathname
      ) {
        return false;
      }

      const context = { request, url };
      const didMatch = await (matches?.(context) ?? true);
      if (didMatch) {
        matchedContexts.set(request, context);
      }

      return didMatch;
    },
    ({ request }) => {
      const context = matchedContexts.get(request);
      if (!context) {
        throw new Error(`Missing matched XRPC context for ${method}`);
      }

      return resolve(context);
    },
  );
};

export const readXrpcJsonBody = async (
  request: Request,
): Promise<Record<string, unknown> | undefined> => {
  try {
    const body = await request.clone().json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return;
  }
};
