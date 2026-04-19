import z from "zod";
import {
  createExtractSocialData,
  extractSocialData,
  getSocialIcon,
} from "./socials.ts";
import {
  createSocialLinks,
  type CreateSocialLinksConfig,
  type DomainShortcuts,
  type SOCIAL_TYPES as INNER_SOCIAL_TYPES,
} from "./social-links.ts";

const urlSchema =
  typeof (z as any).url === "function"
    ? (z as any).url()
    : z.string().url();

export const SocialsSchema = z.union([
  urlSchema,
  z.object({
    icon: z.string().optional(),
    platform: z.string().optional(),
    url: urlSchema,
    username: z.string().optional(),
  }),
]);

export type SocialsSchema = z.infer<typeof SocialsSchema>;

export type SOCIAL_TYPES = INNER_SOCIAL_TYPES;
export type { DomainShortcuts };

export type CreateSocialsConfig = CreateSocialLinksConfig;

const buildTransformSocial =
  (extractor: ReturnType<typeof createExtractSocialData>) =>
  (social: SocialsSchema) => {
    if (typeof social == "string") {
      return extractor({ url: social });
    }
    const { icon, url, platform, username } = social;
    const data = extractor({ url });

    return {
      icon:
        icon ??
        (platform === undefined
          ? data.icon
          : getSocialIcon(platform as INNER_SOCIAL_TYPES)),
      url: url ?? data.url,
      platform: platform ?? data.platform,
      username: username ?? data.username,
    };
  };

export const createSocialsTransformer = (config: CreateSocialsConfig = {}) => {
  const socialLinks = createSocialLinks(config);
  const extractor = createExtractSocialData(socialLinks);
  const transformSocial = buildTransformSocial(extractor);

  const SocialLinks = z
    .array(SocialsSchema)
    .default([])
    .transform((socialUrls) => socialUrls.map(transformSocial));

  return { SocialsSchema, transformSocial, SocialLinks, socialLinks };
};

// Export a default transformer
export const transformSocial = buildTransformSocial(extractSocialData);

export const SocialLinks = z
  .array(SocialsSchema)
  .default([])
  .transform((socialUrls) => socialUrls.map(transformSocial));

export type SocialLinksData = z.infer<typeof SocialLinks>;
