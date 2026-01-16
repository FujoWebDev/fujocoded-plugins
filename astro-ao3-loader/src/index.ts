import { getWork, getSeries, setFetcher } from "@fujocoded/ao3.js";
import { readFileSync } from "node:fs";
import { WorkSummarySchema } from "./schemas.ts";
import { parse } from "yaml";
import type { Loader, LoaderContext } from "astro/loaders";
import { getFetcher, getNextFicGroupFetcher } from "./utils.ts";

export const worksLoader: Loader = {
  name: "ao3-works-loader",
  load: async ({ store, logger }: LoaderContext) => {
    setFetcher(getFetcher(logger));
    const file = readFileSync("./src/content/ao3/works.yaml", {
      encoding: "utf-8",
    });
    const workIds = (parse(file) as any[]).map((workId) => workId.toString());
    const ficGroupsFetcher = getNextFicGroupFetcher(workIds, logger)();
    while (true) {
      const nextBatch = ficGroupsFetcher.next();
      logger.info(`Loading fics ${nextBatch.value?.join(", ")}`);
      const fetchedWorks = await Promise.allSettled(
        nextBatch.value?.map((workId) =>
          getWork({ workId: workId.toString() })
        ) ?? []
      );
      fetchedWorks.forEach((response) => {
        if (response.status == "rejected") {
          return;
        }
        logger.info(`Setting data for fic ${response.value.id}`);
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


export const seriesLoader: Loader = {
  name: "ao3-series-loader",
  load: async ({ store, logger }: LoaderContext) => {
    setFetcher(getFetcher(logger));
    const file = readFileSync("./src/content/ao3/series.yaml", {
      encoding: "utf-8",
    });
    const seriesId = (parse(file) as any[]).map((workId) => workId.toString());
    const ficGroupsFetcher = getNextFicGroupFetcher(seriesId, logger)();
    while (true) {
      const nextBatch = ficGroupsFetcher.next();
      logger.info(`Loading fics ${nextBatch.value?.join(", ")}`);
      const fetchedWorks = await Promise.allSettled(
        nextBatch.value?.map((workId) =>
          getSeries({ seriesId: workId.toString() })
        ) ?? []
      );
      fetchedWorks.forEach((response) => {
        if (response.status == "rejected") {
          return;
        }
        logger.info(`Setting data for fic ${response.value.id}`);
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
