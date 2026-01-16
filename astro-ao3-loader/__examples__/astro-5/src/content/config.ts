import { defineCollection } from "astro:content";
import { worksLoader } from "@fujocoded/astro-ao3-loader";

export const collections = {
  fanfictions: defineCollection({ loader: worksLoader }),
};