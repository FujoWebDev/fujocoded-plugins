import { type ProfileMatch, SocialLinks as SocialLinksLib } from "social-links";

export type { ProfileMatch };

/**
 * Per-platform shortcut builders: turn a bare domain like `"blorbo.social"`
 * into a `ProfileMatch` that knows the platform's URL shape.
 */
const DOMAIN_PATTERNS = {
  mastodon: (domain: string) => ({
    match: `https?://${escapeForRegex(domain)}/@([a-z0-9-_]+)(?:/.*)?`,
    group: 1,
  }),
} as const satisfies Record<string, (domain: string) => ProfileMatch>;

export type DomainShortcuts = {
  [K in keyof typeof DOMAIN_PATTERNS]?: string[];
};

const escapeForRegex = (input: string) =>
  input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HANDLE = `${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+`;
// Bluesky profile URLs accept a DID in place of a handle, e.g.
// `bsky.app/profile/did:plc:abc123` or `did:web:example.com`.
const DID = "did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]";

export type CreateSocialLinksConfig = {
  /**
   * Register extra domains against a platform with a known URL shape
   * (currently: `mastodon`). The library generates the correct regex.
   */
  domains?: DomainShortcuts;
};

const CUSTOM_PROFILE_MATCHES = {
  tumblr: [
    {
      match: "https?://www\\.tumblr\\.com/([a-z0-9-]+)/?.*",
      // TODO: more may be necessary for things like extracting usernames
      group: 1,
    },
    // Must be last because it's a more general match, or www will be as a username
    {
      match: "https?://([a-z0-9-]+)\\.tumblr\\.com/?.*",
      // TODO: more may be necessary for things like extracting usernames
      group: 1,
    },
  ],
  "ko-fi": [
    {
      match: "https?://ko-fi\\.com/([a-z0-9-_]+)",
      group: 1,
    },
  ],
  inprnt: [
    {
      match: "https?://(?:www\\.)?inprnt\\.com/gallery/([a-z0-9-]+)/?",
      group: 1,
    },
  ],
  neocities: [
    {
      match: "https?://([a-z0-9-]+)\\.neocities\\.org",
      group: 1,
    },
  ],
  bsky: [
    {
      match: "https?://([a-z0-9-]+)\\.bsky\\.(?:app|social)/?.*",
      group: 1,
    },
    {
      match: `https?://bsky\\.(?:app|social)/profile/(${HANDLE}|${DID})/?.*`,
      group: 1,
    },
  ],
  archiveofourown: [
    {
      match: "https?://archiveofourown\\.org/users/([a-z0-9-]+)",
      group: 1,
    },
  ],
  dreamwidth: [
    {
      match: "https?://([a-z0-9-]+)\\.dreamwidth\\.org",
      group: 1,
    },
  ],
  furaffinity: [
    {
      match: "https?://www\\.furaffinity\\.net/user/([a-z0-9-]+)",
      group: 1,
    },
  ],
  carrd: [
    {
      match: "https?://([a-z0-9-]+)\\.carrd\\.co/?",
      group: 1,
    },
  ],
  kickstarter: [
    {
      // https://www.kickstarter.com/projects/essential-randomness/the-fujoshi-guide-to-web-development
      match:
        "https?://www\\.kickstarter\\.com/projects/[a-z0-9-]+/([a-z0-9-]+)/?",
      group: 1,
    },
  ],
  npm: [
    {
      // Scoped and unscoped packages, e.g.
      // `npmjs.com/package/@bobaboard/ao3.js` or `npmjs.com/package/social-links`.
      match:
        "https?://www\\.npmjs\\.com/package/((?:@[a-z0-9-._]+/)?[a-z0-9-._]+)/?",
      group: 1,
    },
  ],
} satisfies Record<string, ProfileMatch[]>;

type CUSTOM_TYPES = keyof typeof CUSTOM_PROFILE_MATCHES;

export const createSocialLinks = (config: CreateSocialLinksConfig = {}) => {
  const socialLinks = new SocialLinksLib();

  for (const [platform, matches] of Object.entries(CUSTOM_PROFILE_MATCHES) as [
    CUSTOM_TYPES,
    ProfileMatch[],
  ][]) {
    socialLinks.addProfile(platform, matches);
  }

  // Social Links does not give us a way to add extra matches
  // but we chose to make it happen anyway.

  const gitHubMatches: ProfileMatch[] = [
    {
      // https://github.com/FujoWebDev/AO3.js
      match: "https?://github\\.com/([a-z0-9-]+/[a-z0-9-\\.]+)/?",
      group: 1,
    },
    {
      // https://github.com/orgs/FujoWebDev/
      match: "https?://github\\.com/orgs/([a-z0-9-]+)/?",
      group: 1,
    },
  ];
  appendMatches(socialLinks, "github", gitHubMatches);

  const xMatches: ProfileMatch[] = [
    {
      match: "(?:https?://)?(?:www\\.)?x\\.com/@?([a-z0-9-\\.]+)/?.*",
      group: 1,
    },
  ];
  appendMatches(socialLinks, "twitter", xMatches);

  for (const [platform, domains] of Object.entries(config.domains ?? {}) as [
    keyof typeof DOMAIN_PATTERNS,
    string[] | undefined,
  ][]) {
    const buildMatch = DOMAIN_PATTERNS[platform];
    appendMatches(socialLinks, platform, (domains ?? []).map(buildMatch));
  }

  return socialLinks;
};

const appendMatches = (
  socialLinks: SocialLinksLib,
  platform: string,
  matches: ProfileMatch[],
) => {
  // @ts-expect-error profiles is private on SocialLinks
  const existing: ProfileMatch[] = socialLinks.profiles.get(platform) ?? [];
  // @ts-expect-error profiles is private on SocialLinks
  socialLinks.profiles.set(platform, [...existing, ...matches]);
};

// This top-level call is safe even under `"sideEffects": false` in package.json
// because the logic in `createSocialLinks` only mutates the returned
//  object, and doesn't touch anything observable from outside the package.
export const socialLinks = createSocialLinks();

// Extracted on 6/20/24
type LIBRARY_TYPES =
  | "behance"
  | "dev_to"
  | "dribbble"
  | "exercism"
  | "facebook"
  | "github"
  | "instagram"
  | "keybase"
  | "lemmy_world"
  | "linkedin"
  | "linktree"
  | "mastodon"
  | "medium"
  | "patreon"
  | "pinterest"
  | "soundcloud"
  | "spotify"
  | "stackoverflow"
  | "substack"
  | "telegram"
  | "tiktok"
  | "twitch"
  | "twitter"
  | "vk"
  | "youtube";

export type SOCIAL_TYPES = LIBRARY_TYPES | CUSTOM_TYPES | "custom";
