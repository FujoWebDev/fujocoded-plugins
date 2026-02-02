import { defineCollection } from "astro:content";
import { worksLoader, seriesLoader } from "@fujocoded/astro-ao3-loader";

/**
 * You can configure content collections in Astro by exporting
 * "collections" from `src/content/config`, like you see here.
 *
 * This loader exports two collections:
 * - fanfictions, which uses our worksLoader
 * - series, which uses our seriesLoader
 *
 * Learn more: https://docs.astro.build/en/guides/content-collections/#defining-collections
 */
export const collections = {
  fanfictions: defineCollection({ loader: worksLoader }),
  series: defineCollection({ loader: seriesLoader }),
};
