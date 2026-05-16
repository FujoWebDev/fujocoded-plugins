import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SocialLinks } from "@fujocoded/zod-transform-socials/zod4";

const team = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/data/team" }),
  schema: z.object({
    name: z.string(),
    contacts: SocialLinks,
  }),
});

export const collections = { team };
