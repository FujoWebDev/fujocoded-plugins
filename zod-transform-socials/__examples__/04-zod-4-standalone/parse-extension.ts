import { strict as assert } from "node:assert";
import {
  SocialLinkObjectSchema,
  transformSocial,
  urlSchema,
} from "@fujocoded/zod-transform-socials/zod4";
import { z } from "zod";

const SocialLinkWithLabel = z.union([
  // Simple links get transformed just like the library does
  urlSchema.transform(transformSocial),
  SocialLinkObjectSchema.extend({
    // We extend object links with an optional label field
    label: z.string().optional(),
  }).transform((socialLinkData) => ({
    // We transform the socialLinkData just like the library does
    ...transformSocial(socialLinkData),
    // And we also add the label field
    label: socialLinkData.label,
  })),
]);

const Member = z.object({
  name: z.string(),
  contacts: z.array(SocialLinkWithLabel).default([]),
});

const parsed = Member.parse({
  name: "essential-randomness",
  contacts: [
    {
      url: "https://essentialrandomness.com",
      label: "Website",
    },
    {
      url: "https://indiepocalypse.social/@essentialrandom",
      platform: "mastodon",
      label: "Mastodon",
    },
    "https://github.com/essential-randomness",
  ],
});

assert.deepStrictEqual(parsed, {
  name: "essential-randomness",
  contacts: [
    {
      url: "https://essentialrandomness.com",
      platform: "custom",
      username: null,
      icon: null,
      label: "Website",
    },
    {
      icon: "simple-icons:mastodon",
      url: "https://indiepocalypse.social/@essentialrandom",
      platform: "mastodon",
      username: null,
      label: "Mastodon",
    },
    {
      url: "https://github.com/essential-randomness",
      platform: "github",
      username: "essential-randomness",
      icon: "simple-icons:github",
    },
  ],
});

console.log(JSON.stringify(parsed, null, 2));
