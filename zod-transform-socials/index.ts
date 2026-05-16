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

export const SocialsSchema = z.union([
  z.string().url(),
  z.object({
    icon: z.string().optional(),
    label: z.string().optional(),
    platform: z.string().optional(),
    url: z.string().url(),
    username: z.string().optional(),
  }),
]);

export type SocialsSchema = z.infer<typeof SocialsSchema>;

export type SOCIAL_TYPES = INNER_SOCIAL_TYPES;
export type { DomainShortcuts };

export type CreateSocialsConfig = CreateSocialLinksConfig;

const generateLabel = (
  inputLabel: string | undefined,
  platform: string,
  url: string,
): string => {
  if (inputLabel) return inputLabel;
  if (platform !== "custom") return platform;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch {
    return url;
  }
};

const buildTransformSocial =
  (extractor: ReturnType<typeof createExtractSocialData>) =>
  (social: SocialsSchema) => {
    if (typeof social == "string") {
      const data = extractor({ url: social });
      return { ...data, label: generateLabel(undefined, data.platform, social) };
    }
    const { icon, label, url, platform, username } = social;
    const data = extractor({ url });

    const resolvedPlatform = platform ?? data.platform;

    return {
      icon:
        icon ??
        (platform === undefined
          ? data.icon
          : getSocialIcon(platform as INNER_SOCIAL_TYPES)),
      label: generateLabel(label, resolvedPlatform, url),
      url: url ?? data.url,
      platform: resolvedPlatform,
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
