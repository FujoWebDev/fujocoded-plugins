import { defineCollection } from "astro:content";
import { worksLoader, seriesLoader } from "@fujocoded/astro-ao3-loader";

export const collections = {
  fanfictions: defineCollection({ loader: worksLoader }),
  series: defineCollection({ loader: seriesLoader }),
};