import { getWork, getSeries, setFetcher } from "@fujocoded/ao3.js";
import { readFileSync } from "node:fs";
import { workSummarySchema, seriesSchema } from "@fujocoded/ao3.js/zod-schemas";
import { parse } from "yaml";
import type { Loader, LoaderContext } from "astro/loaders";
import { z } from "zod";
import { getFetcher, getProgressTracker } from "./utils.ts";

const PREFIX_ANSI_COLORS = {
  works: "\x1b[36m", // Cyan
  series: "\x1b[35m", // Magenta
  reset: "\x1b[0m",
};

const getPrefix = (type: "works" | "series") => {
  const color = PREFIX_ANSI_COLORS[type];
  return `${color}[${type}]${PREFIX_ANSI_COLORS.reset}`;
};


async function loadItems<T extends { id: string | number }>(
  { store, logger }: LoaderContext,
  config: {
    type: "works" | "series";
    yamlPath: string;
    fetchFn: (id: string) => Promise<NonNullable<T>>;
  }
) {
  setFetcher(getFetcher(logger));

  const file = readFileSync(config.yamlPath, { encoding: "utf-8" });
  const ids = z.string({ coerce: true }).array().parse(parse(file));

  const tracker = getProgressTracker({
    logger,
    prefix: getPrefix(config.type),
    total: ids.length,
    itemsType: config.type
  });

  try {
    await Promise.all(
      ids.map(async (id) => {
        try {
          const item = await config.fetchFn(id);
          store.set({ id: item.id.toString(), data: { ...item } });
          tracker.incrementSuccess();
        } catch (error) {
          tracker.incrementFail();
          logger.error(
            `${getPrefix(config.type)} Failed to fetch ${config.type.slice(0, -1)} ${id}: ${error}`
          );
        }
      })
    );
  } finally {
    tracker.finish();
  }
}

export const worksLoader: Loader = {
  name: "ao3-loader",
  load: (context) =>
    loadItems(context, {
      type: "works",
      yamlPath: "./src/content/ao3/works.yaml",
      fetchFn: (workId) => getWork({ workId }),
    }),
  schema: workSummarySchema,
};

export const seriesLoader: Loader = {
  name: "ao3-loader",
  load: (context) =>
    loadItems(context, {
      type: "series",
      yamlPath: "./src/content/ao3/series.yaml",
      fetchFn: (seriesId) => getSeries({ seriesId }),
    }),
  schema: seriesSchema,
};
