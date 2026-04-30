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

// Detect which Zod is in the user's project
import * as z from "zod";

const isZod4 = "_zod" in z.string();

export const urlSchema = isZod4
  ? (z as any).url() // z.url() → ZodURL in v4
  : z.string().url(); // z.string().url() → ZodString in v3

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
    const urlString =
      typeof social === "string"
        ? social
        : social instanceof URL
          ? social.href
          : social.url instanceof URL
            ? social.url.href
            : social.url;

    if (typeof social === "string" || social instanceof URL) {
      return extractor({ url: urlString as string });
    }
    const { icon, url, platform, username } = social;
    const urlStr = url instanceof URL ? url.href : url;
    const data = extractor({ url: urlStr });

    return {
      icon:
        icon ??
        (platform === undefined
          ? data.icon
          : getSocialIcon(platform as INNER_SOCIAL_TYPES)),
      url: urlStr,
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
    .transform((socialUrls) => socialUrls.map(transformSocial))
    .default([]);

  return { SocialsSchema, transformSocial, SocialLinks, socialLinks };
};

// Export a default transformer
export const transformSocial = buildTransformSocial(extractSocialData);

export const SocialLinks = z
  .array(SocialsSchema)
  .transform((socialUrls) => socialUrls.map(transformSocial))
  .default([]);

export type SocialLinksData = z.infer<typeof SocialLinks>;
