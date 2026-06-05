import type { SocialLinks as SocialLinksLib } from "social-links";
import {
  type DomainShortcuts,
  type SOCIAL_TYPES as INNER_SOCIAL_TYPES,
} from "./social-links.ts";
import {
  createTransformSocial,
  transformSocial,
  type CreateSocialsConfig,
  type SocialLinkData,
  type SocialsInput,
} from "./transform.ts";
import * as z from "zod";

// Zod 4 adds a top-level `toJSONSchema`; Zod 3 doesn't. If we see it, the
// consumer (likely Astro 6) is on Zod 4 and should be using the /zod4 entry.
if (typeof (z as { toJSONSchema?: unknown }).toJSONSchema === "function") {
  console.warn(
    "[@fujocoded/zod-transform-socials] Zod 4 is installed but you imported the Zod 3 entry. Use `@fujocoded/zod-transform-socials/zod4` instead.",
  );
}

const createSocialLinkObjectSchema = (urlSchema: z.ZodString) =>
  z.object({
    icon: z.string().optional(),
    platform: z.string().optional(),
    url: urlSchema,
    username: z.string().optional(),
  });

const createSocialLinkInputSchema = (
  urlSchema: z.ZodString,
  SocialLinkObjectSchema = createSocialLinkObjectSchema(urlSchema),
) => z.union([urlSchema, SocialLinkObjectSchema]);

const createSocialLinksSchema = (
  SocialsSchema: z.ZodType<SocialsInput>,
  transformSocial: (social: SocialsInput) => SocialLinkData,
): z.ZodType<SocialLinkData[]> =>
  z
    .array(SocialsSchema)
    .transform((socialUrls) => socialUrls.map(transformSocial))
    .default([]) as z.ZodType<SocialLinkData[]>;

export const urlSchema: z.ZodString = z.string().url();
export const SocialLinkObjectSchema = createSocialLinkObjectSchema(urlSchema);
export const SocialLinkInputSchema = createSocialLinkInputSchema(
  urlSchema,
  SocialLinkObjectSchema,
);
/**
 * @deprecated Use `SocialLinkInputSchema` instead.
 */
export const SocialsSchema = SocialLinkInputSchema;
export const SocialLinks = createSocialLinksSchema(
  SocialLinkInputSchema,
  transformSocial,
);

export const createSocialsTransformer = (
  config: CreateSocialsConfig = {},
): SocialsTransformer => {
  const urlSchema = z.string().url();
  const SocialLinkObjectSchema = createSocialLinkObjectSchema(urlSchema);
  const SocialLinkInputSchema = createSocialLinkInputSchema(
    urlSchema,
    SocialLinkObjectSchema,
  );
  const { transformSocial, socialLinks } = createTransformSocial(config);
  const SocialLinks = createSocialLinksSchema(
    SocialLinkInputSchema,
    transformSocial,
  );

  return {
    SocialLinkObjectSchema,
    SocialLinkInputSchema,
    SocialsSchema: SocialLinkInputSchema,
    transformSocial,
    SocialLinks,
    socialLinks,
  };
};

export { transformSocial };

export type SocialLinkInput = SocialsInput;
export type SocialLinkObject = z.infer<typeof SocialLinkObjectSchema>;
/**
 * @deprecated Use `SocialLinkInput` instead.
 */
export type SocialsSchema = SocialLinkInput;
export type SocialLinksData = SocialLinkData[];
export type SOCIAL_TYPES = INNER_SOCIAL_TYPES;
export type SocialsTransformer = {
  SocialLinkObjectSchema: typeof SocialLinkObjectSchema;
  SocialLinkInputSchema: typeof SocialLinkInputSchema;
  SocialsSchema: z.ZodType<SocialsInput>;
  transformSocial: typeof transformSocial;
  SocialLinks: z.ZodType<SocialLinkData[]>;
  socialLinks: SocialLinksLib;
};
export type {
  CreateSocialsConfig,
  DomainShortcuts,
  SocialLinkData,
  SocialsInput,
};
