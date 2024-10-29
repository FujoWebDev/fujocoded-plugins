import { getWork, setFetcher } from "@bobaboard/ao3.js";
import { readFileSync } from "node:fs";
import { WorkSummarySchema } from "./schemas.ts";
import { parse } from "yaml";
import type { Loader, LoaderContext } from "astro/loaders";

let LOGGER: LoaderContext["logger"] | null = null;

const GROUP_SIZE = 5;
const getNextFicGroupFetcher = (workIds: string[]) => {
  const fetchedFics = [];
  return function* () {
    while (fetchedFics.length < workIds.length) {
      LOGGER!.info(
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
setFetcher(async (...params: Parameters<typeof fetch>) => {
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
      LOGGER!.info(
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
    LOGGER!.error(e as string);
    throw e;
  }
});

export const worksLoader: Loader = {
  name: "ao3-works-loader",
  load: async ({ store, logger }: LoaderContext) => {
    LOGGER = logger;
    const file = readFileSync("./src/content/ao3/works.yaml", {
      encoding: "utf-8",
    });
    const workIds = (parse(file) as any[]).map((workId) => workId.toString());
    const ficGroupsFetcher = getNextFicGroupFetcher(workIds)();
    while (true) {
      const nextBatch = ficGroupsFetcher.next();
      LOGGER.info(`Loading fics ${nextBatch.value?.join(", ")}`);
      const fetchedWorks = await Promise.allSettled(
        nextBatch.value?.map((workId) =>
          getWork({ workId: workId.toString() })
        ) ?? []
      );
      fetchedWorks.forEach((response) => {
        if (response.status == "rejected") {
          return;
        }
        LOGGER!.info(`Setting data for fic ${response.value.id}`);
        // @ts-expect-error TODO: apparently interfaces and types treat
        // index signatures differently
        store.set({ id: response.value.id, data: response.value });
      });
      if (nextBatch.done) {
        break;
      }
    }
  },
  schema: WorkSummarySchema,
};
