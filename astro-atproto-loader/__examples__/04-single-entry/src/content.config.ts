import { z } from "astro/zod";
import {
  defineAtProtoCollection,
  isAtBlob,
  toHostedBlob,
} from "@fujocoded/astro-atproto-loader";

const sprites = defineAtProtoCollection({
  source: {
    repo: "bmann.ca",
    collection: "actor.rpg.sprite",
  },
  outputSchema: z.object({
    updatedAt: z.coerce.date(),
    spriteSheet: z.object({
      url: z.url(),
      mimeType: z.string(),
      size: z.number(),
    }),
  }),
  transform: ({ repo, rkey, value }) => {
    const v = value as { spriteSheet: unknown; updatedAt: unknown };

    // Drop the record if spriteSheet is not a blob
    if (!isAtBlob(v.spriteSheet)) return undefined;

    return {
      id: rkey,
      data: {
        updatedAt: v.updatedAt,
        spriteSheet: toHostedBlob({ repo, blob: v.spriteSheet }),
      },
    };
  },
});

export const collections = { "sprites-static": sprites };
