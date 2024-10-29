import { z } from "zod";

const UnlockedWorkSummarySchema = z.object({
  id: z.string(),
  locked: z.literal(false),
  title: z.string(),
  rating: z.enum([
    "Not Rated",
    "General Audiences",
    "Teen And Up Audiences",
    "Mature",
    "Explicit",
  ]),
  authors: z.union([
    z.literal("Anonymous"),
    z
      .object({
        username: z.string(),
        pseud: z.string(),
      })
      .array(),
  ]),
});

const LockedWorkSummarySchema = z.object({
  id: z.string(),
  locked: z.literal(true),
});

export const WorkSummarySchema = z.discriminatedUnion("locked", [
  UnlockedWorkSummarySchema,
  LockedWorkSummarySchema,
]);
