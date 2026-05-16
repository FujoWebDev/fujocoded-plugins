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

const createSocialsSchema = (urlSchema: z.ZodType<string>) =>
  z.union([
    urlSchema,
    z.object({
      icon: z.string().optional(),
      platform: z.string().optional(),
      url: urlSchema,
      username: z.string().optional(),
    }),
  ]);

const createSocialLinksSchema = (
  SocialsSchema: ReturnType<typeof createSocialsSchema>,
  transformSocial: (social: z.infer<typeof SocialsSchema>) => SocialLinkData,
) =>
  z
    .array(SocialsSchema)
    .transform((socialUrls) => socialUrls.map(transformSocial))
    .default([]);

export const urlSchema = z.url();
export const SocialsSchema = createSocialsSchema(urlSchema);
export const SocialLinks = createSocialLinksSchema(
  SocialsSchema,
  transformSocial,
);

export const createSocialsTransformer = (config: CreateSocialsConfig = {}) => {
  const SocialsSchema = createSocialsSchema(z.url());
  const { transformSocial, socialLinks } = createTransformSocial(config);
  const SocialLinks = createSocialLinksSchema(SocialsSchema, transformSocial);

  return {
    SocialsSchema,
    transformSocial,
    SocialLinks,
    socialLinks,
  };
};

export { transformSocial };

export type SocialsSchema = z.infer<typeof SocialsSchema>;
export type SocialLinksData = z.infer<typeof SocialLinks>;
export type SOCIAL_TYPES = INNER_SOCIAL_TYPES;
export type { CreateSocialsConfig, DomainShortcuts, SocialLinkData };
