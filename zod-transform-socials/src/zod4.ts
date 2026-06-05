/**
 * Zod 4 entry point. Mirrors `index.ts`, but pulls in `zod/v4` so the schemas
 * are Zod 4 instances. Use this when consuming the package from a Zod 4
 * project (e.g. Astro 6); use `index.ts` for Zod 3.
 */
import {
  type DomainShortcuts,
  type SOCIAL_TYPES as INNER_SOCIAL_TYPES,
} from "./social-links.ts";
import {
  createTransformSocial,
  transformSocial,
  type CreateSocialsConfig,
  type SocialLinkData,
} from "./transform.ts";
import * as z from "zod/v4";

const createSocialLinkObjectSchema = (urlSchema: z.ZodType<string>) =>
  z.object({
    icon: z.string().optional(),
    platform: z.string().optional(),
    url: urlSchema,
    username: z.string().optional(),
  });

const createSocialLinkInputSchema = (
  urlSchema: z.ZodType<string>,
  SocialLinkObjectSchema = createSocialLinkObjectSchema(urlSchema),
) => z.union([urlSchema, SocialLinkObjectSchema]);

const createSocialLinksSchema = (
  SocialsSchema: ReturnType<typeof createSocialLinkInputSchema>,
  transformSocial: (social: z.infer<typeof SocialsSchema>) => SocialLinkData,
) =>
  z
    .array(SocialsSchema)
    .transform((socialUrls) => socialUrls.map(transformSocial))
    .default([]);

export const urlSchema = z.url();
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

export const createSocialsTransformer = (config: CreateSocialsConfig = {}) => {
  const urlSchema = z.url();
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

export type SocialLinkInput = z.infer<typeof SocialLinkInputSchema>;
export type SocialLinkObject = z.infer<typeof SocialLinkObjectSchema>;
/**
 * @deprecated Use `SocialLinkInput` instead.
 */
export type SocialsSchema = SocialLinkInput;
export type SocialLinksData = z.infer<typeof SocialLinks>;
export type SOCIAL_TYPES = INNER_SOCIAL_TYPES;
export type { CreateSocialsConfig, DomainShortcuts, SocialLinkData };
