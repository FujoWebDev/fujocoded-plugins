import type { LoaderContext } from "astro/loaders";

const GROUP_SIZE = 5;
export const getNextFicGroupFetcher = (
  workIds: string[],
  logger: LoaderContext["logger"]
) => {
  const fetchedFics = [];
  return function* () {
    while (fetchedFics.length < workIds.length) {
      logger.info(
        `getting works from ${fetchedFics.length} to ${Math.min(
          workIds.length,
          fetchedFics.length + GROUP_SIZE
        )}
        }`
      );
      const nextGroup = workIds.slice(
        fetchedFics.length,
        Math.min(workIds.length, fetchedFics.length + GROUP_SIZE)
      );
      fetchedFics.push(...nextGroup);
      yield nextGroup;
    }
  };
};

const CACHE = new Map();
export const setFetcher =
  (logger: LoaderContext["logger"]) =>
  async (...params: Parameters<typeof globalThis.fetch>) => {
    try {
      if (CACHE.has(params[0])) {
        // console.log(`Using cached response for request to ${params[0]}`);
        return CACHE.get(params[0]).clone();
      }
      // console.log(`Making a new request to ${params[0]}`);
      let response = await fetch(...params);
      // console.log(`Request status: ${response.status}`);
      while (response.status === 429) {
        let waitSeconds = response.headers.get("retry-after") ?? "60";
        logger.info(
          `Asked to wait ${waitSeconds} seconds request to ${params[0]}`
        );
        // console.log(`Waiting ${waitSeconds} seconds`);
        await new Promise((res) => {
          setTimeout(() => res(null), parseInt(waitSeconds) * 1000);
        });
        // console.log(`Continuing with request to ${params[0]}`);
        response = await fetch(...params);
      }
      if (response.status === 200) {
        // Remove request from the cache after 5 minutes
        setTimeout(() => {
          // console.log(`Clearing cache entry for request ${params[0]}`);
          CACHE.set(params[0], null);
        }, 1000 * 60 * 5);
        // console.log(`Setting cache entry for request ${params[0]}`);
        CACHE.set(params[0], response.clone());
      }
      return response;
    } catch (e) {
      logger.error(e as string);
      throw e;
    }
  };
