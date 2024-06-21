import z from "zod";
import { extractSocialData, getSocialIcon } from "./socials.ts";
import type { SOCIAL_TYPES as INNER_SOCIAL_TYPES } from "./social-links.ts";

export const SocialsSchema = z.union([
  z.string().url(),
  z.object({
    icon: z.string().optional(),
    platform: z.string().optional(),
    url: z.string().url(),
    username: z.string().optional(),
  }),
]);

export type SocialsSchema = z.infer<typeof SocialsSchema>;

export const transformSocial = (social: SocialsSchema) => {
  if (typeof social == "string") {
    return extractSocialData({ url: social });
  }
  const { icon, url, platform, username } = social;
  const data = extractSocialData({ url });

  return {
    ...data,
    icon:
      icon ??
      (platform === undefined
        ? data.icon
        : getSocialIcon(platform as INNER_SOCIAL_TYPES)),
    url,
    platform,
    username,
  };
};

export type SOCIAL_TYPES = INNER_SOCIAL_TYPES;

export const SocialLinks = z
  .array(SocialsSchema)
  .default([])
  .transform((socialUrls) => socialUrls.map(transformSocial));
