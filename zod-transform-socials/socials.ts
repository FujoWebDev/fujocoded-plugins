import { SOCIAL_TYPES, socialLinks } from "./social-links.ts";

export const getSocialIcon = (platform: SOCIAL_TYPES) => {
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

export const extractSocialData = ({ url }: { url: string }) => {
  const lowerUrl = url.toLowerCase();
  const socialLinkAttempt = socialLinks.detectProfile(lowerUrl) as SOCIAL_TYPES;
  if (socialLinkAttempt) {
    return {
      url,
      platform: socialLinkAttempt as SOCIAL_TYPES,
      username: socialLinks.getProfileId(socialLinkAttempt, lowerUrl),
      icon: getSocialIcon(socialLinkAttempt as SOCIAL_TYPES),
    };
  }
  // If you cannot find it, return the original url
  return { url, platform: "custom", username: null, icon: null };
};
