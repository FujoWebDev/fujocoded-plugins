import { defineAction } from "astro:actions";
import { z } from "zod";

export const server = {
  subscribe: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email("Enter a valid email address"),
      handle: z.string().min(2, "Handle must be at least 2 characters").max(40),
    }),
    handler: async (input) => {
      if (input.email.endsWith("@blocked.test")) {
        return {
          ok: false,
          message: "This domain is temporarily blocked.",
        };
      }

      return {
        ok: true,
        email: input.email,
        handle: input.handle,
      };
    },
  }),
  unsubscribe: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().email("Enter a valid email address"),
    }),
    handler: async (input) => {
      return {
        ok: true,
        email: input.email,
      };
    },
  }),
};
