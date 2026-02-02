import { getWork, getSeries, setFetcher } from "@fujocoded/ao3.js";
import { readFileSync } from "node:fs";
import { workSummarySchema, seriesSchema } from "@fujocoded/ao3.js/zod-schemas";
import { parse } from "yaml";
import type { Loader, LoaderContext } from "astro/loaders";
import { z } from "zod";
import { getFetcher } from "./fetcher.ts";
import { getProgressTracker} from "./logger.ts";

/**
 * Loads items of the given "type" from the specified file ("yamlPath"). This uses the "itemFetcher"
 * function to fetch items from Archive of Our Own.
**/
const loadItems = async <T extends { id: string | number }>(
  { store, logger }: LoaderContext,
  config: {
    type: "works" | "series";
    yamlPath: string;
    itemFetcher: (id: string) => Promise<NonNullable<T>>;
  },
) => {
  setFetcher(getFetcher(logger));

  const file = readFileSync(config.yamlPath, { encoding: "utf-8" });
  const ids = z.string({ coerce: true }).array().parse(parse(file));

  const tracker = getProgressTracker({
    logger,
    total: ids.length,
    itemsType: config.type,
  });

  // Start tracking progress for this "itemsType".
  tracker.start();
  try {
    await Promise.all(
      ids.map(async (id) => {
        try {
          // Fetch the item with the specified ID from the archive.
          const item = await config.itemFetcher(id);
          // If that works, add it to the store and mark success.
          store.set({ id: item.id.toString(), data: { ...item } });
          tracker.incrementSuccess();
        } catch (error) {
          // If there's an error, increment the fail count.
          tracker.incrementFail(id, error);
        }
      }),
    );
  } finally {
    // Once everything is done, close off progress tracking.
    tracker.finish();
  }
};

export const worksLoader: Loader = {
  name: "ao3-loader",
  load: (context) =>
    loadItems(context, {
      type: "works",
      yamlPath: "./src/content/ao3/works.yaml",
      itemFetcher: (workId) => getWork({ workId }),
    }),
  schema: workSummarySchema,
};

export const seriesLoader: Loader = {
  name: "ao3-loader",
  load: (context) =>
    loadItems(context, {
      type: "series",
      yamlPath: "./src/content/ao3/series.yaml",
      itemFetcher: (seriesId) => getSeries({ seriesId }),
    }),
  schema: seriesSchema,
};
