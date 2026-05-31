import { HttpResponse, type HttpHandler } from "msw";

import type { RepoFailureOpts } from "./index.ts";
import { defineXrpcRoute, type XrpcRouteContext } from "./xrpc.ts";

export type FailOnceEndpoint =
  | "listRecords"
  | "getRecord"
  | "getBlob"
  | "createRecord"
  | "putRecord"
  | "deleteRecord";

export type FailOnceConfigByEndpoint = {
  listRecords: RepoFailureOpts<"collection">;
  getRecord: RepoFailureOpts<"collection" | "rkey">;
  getBlob: RepoFailureOpts<"cid">;
  createRecord: RepoFailureOpts<"collection">;
  putRecord: RepoFailureOpts<"collection" | "rkey">;
  deleteRecord: RepoFailureOpts<"collection" | "rkey">;
};

export type FailureMatcher<Endpoint extends FailOnceEndpoint> = (
  failure: FailOnceConfigByEndpoint[Endpoint],
) => boolean;

export type FailOnceController = {
  clear: () => void;
  defineRoute: <Endpoint extends FailOnceEndpoint>(config: {
    endpoint: Endpoint;
    method: string;
    httpMethod?: "get" | "post";
    matches: (
      context: XrpcRouteContext,
    ) =>
      | FailureMatcher<Endpoint>
      | undefined
      | Promise<FailureMatcher<Endpoint> | undefined>;
  }) => HttpHandler;
  queue: <Endpoint extends FailOnceEndpoint>(
    endpoint: Endpoint,
    config?: FailOnceConfigByEndpoint[Endpoint],
  ) => void;
};

const defaultFailures = {
  invalidRequest: { error: "InvalidRequest", message: "Invalid request" },
  notFound: { error: "NotFound", message: "Blob not found" },
  recordNotFound: {
    error: "RecordNotFound",
    message: "Record not found",
  },
  internalServerError: {
    error: "InternalServerError",
    message: "Internal server error",
  },
} as const;

const defaultFailureByStatus: Record<
  number,
  { error: string; message: string }
> = {
  401: { error: "AuthRequired", message: "Authentication required" },
  403: { error: "Forbidden", message: "Forbidden" },
  429: { error: "RateLimitExceeded", message: "Rate limit exceeded" },
};

const defaultAtprotoFailure = (endpoint: FailOnceEndpoint, status: number) => {
  if (status === 404) {
    return endpoint === "getBlob"
      ? defaultFailures.notFound
      : defaultFailures.recordNotFound;
  }
  if (status >= 500 && status <= 599) {
    return defaultFailures.internalServerError;
  }
  return defaultFailureByStatus[status] ?? defaultFailures.invalidRequest;
};

const failOnceResponse = (
  endpoint: FailOnceEndpoint,
  failure: RepoFailureOpts,
) => {
  const status = failure.status ?? 500;
  const defaults = defaultAtprotoFailure(endpoint, status);

  return HttpResponse.json(
    {
      error: failure.error ?? defaults.error,
      message: failure.message ?? defaults.message,
    },
    { status },
  );
};

export const matchesFields =
  <Fields extends string>(actual: Record<Fields, string>) =>
  (failure: Partial<Record<Fields, string>>): boolean =>
    (Object.entries(actual) as [Fields, string][]).every(
      ([field, value]) =>
        failure[field] === undefined || failure[field] === value,
    );

export const createFailOnceController = ({
  pds,
}: {
  pds: string;
}): FailOnceController => {
  const pendingFailures: {
    [Endpoint in FailOnceEndpoint]: FailOnceConfigByEndpoint[Endpoint][];
  } = {
    listRecords: [],
    getRecord: [],
    getBlob: [],
    createRecord: [],
    putRecord: [],
    deleteRecord: [],
  };

  const consume = <Endpoint extends FailOnceEndpoint>(
    endpoint: Endpoint,
    matchesFailure: FailureMatcher<Endpoint>,
  ) => {
    const failures = pendingFailures[endpoint];
    const index = failures.findIndex(matchesFailure);

    if (index === -1) {
      return;
    }

    return failures.splice(index, 1)[0];
  };

  return {
    clear() {
      for (const failures of Object.values(pendingFailures)) {
        failures.splice(0);
      }
    },
    defineRoute({ endpoint, method, httpMethod, matches }) {
      const matchedFailures = new WeakMap<Request, RepoFailureOpts>();

      return defineXrpcRoute({
        pds,
        method,
        httpMethod,
        async matches(context) {
          if (pendingFailures[endpoint].length === 0) {
            return false;
          }

          const matchesFailure = await matches(context);
          if (!matchesFailure) {
            return false;
          }

          const failure = consume(endpoint, matchesFailure);
          if (!failure) {
            return false;
          }

          matchedFailures.set(context.request, failure);
          return true;
        },
        resolve({ request }) {
          return failOnceResponse(endpoint, matchedFailures.get(request) ?? {});
        },
      });
    },
    queue(endpoint, config = {}) {
      pendingFailures[endpoint].push(config);
    },
  };
};
