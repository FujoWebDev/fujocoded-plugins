import { type ProfileMatch, SocialLinks } from "social-links";

export const socialLinks = new SocialLinks();

const tumblrMatches: ProfileMatch[] = [
  {
    match: "https?://([a-z0-9-]+).tumblr.com/?",
    // TODO: more may be necessary for things like extracting usernames
    group: 1,
  },
  {
    match: "https?://www.tumblr.com/([a-z0-9-]+)",
    // TODO: more may be necessary for things like extracting usernames
    group: 1,
  },
];
socialLinks.addProfile("tumblr", tumblrMatches);
const kofiMatches: ProfileMatch[] = [
  {
    match: "https?://ko-fi.com/([a-z0-9-_]+)",
    group: 1,
  },
];
socialLinks.addProfile("ko-fi", kofiMatches);

const inprntMatches: ProfileMatch[] = [
  {
    match: "https?://(?:www.)?inprnt.com/gallery/([a-z0-9-]+)/?",
    group: 1,
  },
];
socialLinks.addProfile("inprnt", inprntMatches);

const neocitiesMatches: ProfileMatch[] = [
  {
    match: "https?://([a-z0-9-]+).neocities.org",
    group: 1,
  },
];
socialLinks.addProfile("neocities", neocitiesMatches);

const blueSkyMatches: ProfileMatch[] = [
  {
    match: "https?://([a-z0-9-]+).bsky.social",
    group: 1,
  },
];
socialLinks.addProfile("bsky", blueSkyMatches);

const ao3Matches: ProfileMatch[] = [
  {
    match: "https?://archiveofourown.org/users/([a-z0-9-]+)",
    group: 1,
  },
];
socialLinks.addProfile("archiveofourown", ao3Matches);

const dreamwidthMatches: ProfileMatch[] = [
  {
    match: "https?://([a-z0-9-]+).dreamwidth.org",
    group: 1,
  },
];
socialLinks.addProfile("dreamwidth", dreamwidthMatches);

const furaffinityMatches: ProfileMatch[] = [
  {
    match: "https?://www.furaffinity.net/user/([a-z0-9-]+)",
    group: 1,
  },
];
socialLinks.addProfile("furaffinity", furaffinityMatches);

const carrdMatches: ProfileMatch[] = [
  {
    match: "https?://([a-z0-9-]+).carrd.co/?",
    group: 1,
  },
];
socialLinks.addProfile("carrd", carrdMatches);

const kickstarterMatches: ProfileMatch[] = [
  {
    // https://www.kickstarter.com/projects/essential-randomness/the-fujoshi-guide-to-web-development
    match: "https?://www.kickstarter.com/projects/[a-z0-9-]+/([a-z0-9-]+)/?",
    group: 1,
  },
];
socialLinks.addProfile("kickstarter", kickstarterMatches);

const gitHubMatches: ProfileMatch[] = [
  {
    // https://github.com/FujoWebDev/AO3.js
    match: "https?://github.com/([a-z0-9-]+/[a-z0-9-\\.]+)/?",
    group: 1,
  },
  {
    // https://github.com/orgs/FujoWebDev/
    match: "https?://github.com/orgs/([a-z0-9-]+)/?",
    group: 1,
  },
];

const npmMatches: ProfileMatch[] = [
  {
    // https://www.npmjs.com/package/@bobaboard/ao3.js
    match: "https?://www.npmjs.com/package/([a-z0-9-@]+/[a-z0-9-\\.]+)/?",
    group: 1,
  },
];
socialLinks.addProfile("npm", npmMatches);

// Social Links does not give us a way to add extra matches
// but we chose to make it happen anyway.
// @ts-expect-error
socialLinks.profiles.set("github", [
  // @ts-expect-error
  ...socialLinks.profiles.get("github"),
  ...gitHubMatches,
]);

// Extracted on 6/20/24
type LIBRARY_TYPES =
  | "behance"
  | "dev_to"
  | "dribbble"
  | "exercism"
  | "facebook"
  | "github"
  | "index"
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

type CUSTOM_TYPES =
  | "archiveofourown"
  | "bsky"
  | "dreamwidth"
  | "inprnt"
  | "kickstarter"
  | "ko-fi"
  | "neocities"
  | "npm"
  | "tumblr";

export type SOCIAL_TYPES = LIBRARY_TYPES | CUSTOM_TYPES | "custom";
