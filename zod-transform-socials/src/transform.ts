import type { SocialLinks as SocialLinksLib } from "social-links";
import {
  createSocialLinks,
  socialLinks as defaultSocialLinks,
  type CreateSocialLinksConfig,
  type SOCIAL_TYPES,
} from "./social-links.ts";

export type SocialsInput =
  | string
  | {
      icon?: string;
      platform?: string;
      url: string;
      username?: string;
    };

export type SocialLinkData = {
  icon: string | null;
  url: string;
  platform: string;
  username: string | null;
};

export type CreateSocialsConfig = CreateSocialLinksConfig;

const getSocialIcon = (platform: SOCIAL_TYPES) => {
  if (platform === "inprnt") {
    return "lucide:shopping-bag";
  }
  if (platform === "neocities") {
    return "lucide:cat";
  }
  if (platform === "bsky") {
    return "simple-icons:bluesky";
  }
  if (platform === "dreamwidth") {
    return "simple-icons:livejournal";
  }
  return "simple-icons:" + platform.replaceAll("-", "");
};

const createExtractSocialData =
  (socialLinks: SocialLinksLib) =>
  ({ url }: { url: string }): SocialLinkData => {
    const lowerUrl = url.toLowerCase();
    const socialLinkAttempt = socialLinks.detectProfile(lowerUrl) as SOCIAL_TYPES;
    if (socialLinkAttempt) {
      return {
        url,
        platform: socialLinkAttempt,
        username: socialLinks.getProfileId(socialLinkAttempt, lowerUrl),
        icon: getSocialIcon(socialLinkAttempt),
      };
    }
    return { url, platform: "custom", username: null, icon: null };
  };

const extractSocialData = createExtractSocialData(defaultSocialLinks);

export const createTransformSocial = (config: CreateSocialsConfig = {}) => {
  const socialLinks = createSocialLinks(config);
  const extractor = createExtractSocialData(socialLinks);

  const transformSocial = (social: SocialsInput): SocialLinkData => {
    if (typeof social === "string") {
      return extractor({ url: social });
    }

    const { icon, url, platform, username } = social;
    const data = extractor({ url });

    return {
      icon:
        icon ??
        (platform === undefined
          ? data.icon
          : getSocialIcon(platform as SOCIAL_TYPES)),
      url,
      platform: platform ?? data.platform,
      username: username ?? data.username,
    };
  };

  return { transformSocial, socialLinks };
};

export const transformSocial = (social: SocialsInput): SocialLinkData => {
  if (typeof social === "string") {
    return extractSocialData({ url: social });
  }

  const { icon, url, platform, username } = social;
  const data = extractSocialData({ url });

  return {
    icon:
      icon ??
      (platform === undefined
        ? data.icon
        : getSocialIcon(platform as SOCIAL_TYPES)),
    url,
    platform: platform ?? data.platform,
    username: username ?? data.username,
  };
};
