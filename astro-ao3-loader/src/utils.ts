import type { LoaderContext } from "astro/loaders";
import ky from "ky";
import PQueue from "p-queue";

const CONCURRENCY = 5;
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes total (includes all retries)
const PROGRESS_INTERVAL_MS = 15 * 1000; // 15 seconds

const getRetryReason = (error: Error): string => {
  if (error.name === "TimeoutError") {
    return "Timeout";
  }

  if (error.name === "HTTPError") {
    const response = (error as any).response as Response | undefined;
    const status = response?.status;

    if (status === 429) {
      const retryAfter = response?.headers.get("Retry-After");
      const details = retryAfter ? `, waiting ${retryAfter}s` : "";
      return `Rate limited${details}`;
    }

    if (status === 502) return "Bad gateway (502)";
    if (status === 503) return "Service unavailable (503)";
    if (status === 504) return "Gateway timeout (504)";

    return `HTTP ${status}`;
  }

  return "Unknown error";
};

/**
 * Creates a fetch-compatible function with:
 * - Concurrency limiting (max 5 simultaneous requests)
 * - Automatic retry for HTTP errors (429, 502, 503, 504)
 * - Automatic retry for timeout errors
 * - Response caching with TTL
 *
 * Compatible with ao3.js's `setFetcher()`.
 */
const createFetcher = (logger: LoaderContext["logger"]) => {
  const cache = new Map<string, Response>();
  const queue = new PQueue({ concurrency: CONCURRENCY });

  // Debug-level queue status logging
  queue.on("next", () => {
    logger.debug(`Queue: ${queue.pending} running, ${queue.size} waiting`);
  });

  const client = ky.create({
    timeout: REQUEST_TIMEOUT_MS,
    retry: {
      limit: 5,
      statusCodes: [429, 502, 503, 504],
      afterStatusCodes: [429], // Respects Retry-After header
      backoffLimit: 10_000, // Max delay between retries
      retryOnTimeout: true,
    },
    hooks: {
      beforeRetry: [
        async ({ request, error, retryCount }) => {
          logger.warn(`${getRetryReason(error)}, retrying (${retryCount}/5): ${request.url}`);
        },
      ],
    },
  });

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();

    // Return cached response if available
    const cached = cache.get(url);
    if (cached) {
      logger.debug(`Cache hit: ${url}`);
      return cached.clone();
    }

    // Queue the request for concurrency control
    const result = await queue.add(async () => {
      logger.debug(`Fetching: ${url}`);
      const response = await client(url, init);

      if (response.ok) {
        cache.set(url, response.clone());
        setTimeout(() => cache.delete(url), CACHE_TTL_MS);
      }

      return response;
    });

    // p-queue can return undefined if the task is aborted, but we don't use that feature
    return result as Response;
  };
};


let AO3_FETCHER: typeof fetch | null = null;
export const getFetcher = (logger: LoaderContext["logger"]) => {
  if (!AO3_FETCHER) {
    AO3_FETCHER = createFetcher(logger);
  }
  return AO3_FETCHER;
};

export const getProgressTracker = ({
  logger,
  prefix,
  total,
  itemsType
}: {
  logger: LoaderContext["logger"],
  prefix: string,
  total: number,
  itemsType: string
}) => {
  let successCount = 0;
  // TODO: add details of failed items
  let failCount = 0;
  let timeout: NodeJS.Timeout | undefined;

  const log = () => {
    const completed = successCount + failCount;
    logger.info(
      `${prefix} ${completed}/${total} ${itemsType} loaded ${failCount > 0 ? `(${failCount} failed)` : ""
      }`
    );

    clearTimeout(timeout);
    if (completed < total) {
      timeout = setTimeout(log, PROGRESS_INTERVAL_MS);
    }
  };

  return {
    start: () => {
      logger.info(`${prefix} Loading ${total} ${itemsType}...`);
      timeout = setTimeout(log, PROGRESS_INTERVAL_MS);
    },
    incrementSuccess: () => {
      successCount++;
      log();
    },
    incrementFail: () => {
      failCount++;
      log();
    },
    finish: () => {
      clearTimeout(timeout);
      logger.info(
        `${prefix} Loaded ${successCount} of ${total} ${itemsType} (${failCount} failed)`
      );
    },
  };
};
