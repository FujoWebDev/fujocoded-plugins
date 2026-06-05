import { strict as assert } from "node:assert";
import { z } from "zod";
import { SocialLinks } from "@fujocoded/zod-transform-socials";
import type {
  SocialLinkInput,
  SocialLinksData,
} from "@fujocoded/zod-transform-socials";

// Use `SocialLinks` as a schema field to parse and enrich contact URLs.
const Member = z.object({
  name: z.string(),
  contacts: SocialLinks,
});

// `SocialLinkInput` types each item the schema will accept: a bare URL string,
// or an object that overrides the detected platform / username / icon.
const contacts: SocialLinkInput[] = [
  "https://essentialrandomness.com",
  "https://essential-randomness.tumblr.com",
  "https://twitter.com/essentialrandom",
  {
    url: "https://indiepocalypse.social/@essentialrandom",
    platform: "mastodon",
  },
  "https://github.com/essential-randomness",
  "https://patreon.com/essentialrandomness",
  "https://ko-fi.com/essentialrandomness",
];

// After parsing, every entry is a `SocialLinksData` row with `url`, `platform`,
// `username`, and `icon` filled in (or `null` when the URL didn't match a
// known platform).
const parsed: { name: string; contacts: SocialLinksData } = Member.parse({
  name: "essential-randomness",
  contacts,
});

const expected = {
  name: "essential-randomness",
  contacts: [
    {
      url: "https://essentialrandomness.com",
      platform: "custom",
      username: null,
      icon: null,
    },
    {
      url: "https://essential-randomness.tumblr.com",
      platform: "tumblr",
      username: "essential-randomness",
      icon: "simple-icons:tumblr",
    },
    {
      url: "https://twitter.com/essentialrandom",
      platform: "twitter",
      username: "essentialrandom",
      icon: "simple-icons:twitter",
    },
    {
      icon: "simple-icons:mastodon",
      url: "https://indiepocalypse.social/@essentialrandom",
      platform: "mastodon",
      username: null,
    },
    {
      url: "https://github.com/essential-randomness",
      platform: "github",
      username: "essential-randomness",
      icon: "simple-icons:github",
    },
    {
      url: "https://patreon.com/essentialrandomness",
      platform: "patreon",
      username: "essentialrandomness",
      icon: "simple-icons:patreon",
    },
    {
      url: "https://ko-fi.com/essentialrandomness",
      platform: "ko-fi",
      username: "essentialrandomness",
      icon: "simple-icons:kofi",
    },
  ],
};

assert.deepStrictEqual(parsed, expected);
console.log(JSON.stringify(parsed, null, 2));
