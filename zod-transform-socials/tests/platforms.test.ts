import { describe, expect, test } from "vitest";
import { transformSocial, createTransformSocial } from "../src/transform.ts";

describe("Platform detection across socials", () => {
  test.each([
    {
      url: "https://www.tumblr.com/boba-tan",
      platform: "tumblr",
      username: "boba-tan",
      icon: "simple-icons:tumblr",
    },
    {
      url: "https://boba-tan.tumblr.com",
      platform: "tumblr",
      username: "boba-tan",
      icon: "simple-icons:tumblr",
    },
    {
      url: "https://ko-fi.com/boba-tan",
      platform: "ko-fi",
      username: "boba-tan",
      icon: "simple-icons:kofi",
    },
    {
      url: "https://www.inprnt.com/gallery/boba-tan",
      platform: "inprnt",
      username: "boba-tan",
      icon: "lucide:shopping-bag",
    },
    {
      url: "https://boba-tan.neocities.org",
      platform: "neocities",
      username: "boba-tan",
      icon: "lucide:cat",
    },
    {
      url: "https://archiveofourown.org/users/boba-tan",
      platform: "archiveofourown",
      username: "boba-tan",
      icon: "simple-icons:archiveofourown",
    },
    {
      url: "https://boba-tan.dreamwidth.org",
      platform: "dreamwidth",
      username: "boba-tan",
      icon: "simple-icons:livejournal",
    },
    {
      url: "https://www.furaffinity.net/user/boba-tan",
      platform: "furaffinity",
      username: "boba-tan",
      icon: "simple-icons:furaffinity",
    },
    {
      url: "https://boba-tan.carrd.co",
      platform: "carrd",
      username: "boba-tan",
      icon: "simple-icons:carrd",
    },
    {
      url: "https://www.kickstarter.com/projects/boba-tan/cool-project",
      platform: "kickstarter",
      username: "cool-project",
      icon: "simple-icons:kickstarter",
    },
    {
      url: "https://www.npmjs.com/package/@boba-tan/thing.js",
      platform: "npm",
      username: "@boba-tan/thing.js",
      icon: "simple-icons:npm",
    },
    {
      url: "https://www.npmjs.com/package/social-links",
      platform: "npm",
      username: "social-links",
      icon: "simple-icons:npm",
    },
    {
      url: "https://github.com/FujoWebDev/AO3.js",
      platform: "github",
      username: "fujowebdev/ao3.js",
      icon: "simple-icons:github",
    },
    {
      url: "https://x.com/@boba-tan",
      platform: "twitter",
      username: "boba-tan",
      icon: "simple-icons:twitter",
    },
  ])("detects $platform from $url", ({ url, platform, username, icon }) => {
    expect(transformSocial(url)).toEqual({ url, platform, username, icon });
  });

  test("unrecognized URLs fall through to `custom`", () => {
    expect(transformSocial("https://example.com/boba-tan")).toEqual({
      url: "https://example.com/boba-tan",
      platform: "custom",
      username: null,
      icon: null,
    });
  });
});

describe("createTransformSocial config", () => {
  test("registers extra domains against a known platform shape", () => {
    const { transformSocial: scoped } = createTransformSocial({
      domains: { mastodon: ["fujoweb.social"] },
    });
    expect(scoped("https://fujoweb.social/@boba-tan")).toEqual({
      url: "https://fujoweb.social/@boba-tan",
      platform: "mastodon",
      username: "boba-tan",
      icon: "simple-icons:mastodon",
    });
  });

  test("the same domain is `custom` without the config (control)", () => {
    expect(transformSocial("https://fujoweb.social/@boba-tan").platform).toBe(
      "custom",
    );
  });
});
