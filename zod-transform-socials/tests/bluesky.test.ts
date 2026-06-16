import { describe, expect, test } from "vitest";
import { transformSocial, createTransformSocial } from "../src/transform.ts";
import { socialLinks } from "../src/social-links.ts";

describe("Bluesky: bsky.app/social profile URLs", () => {
  test("extracts a domain handle and tags the platform + icon", () => {
    expect(
      transformSocial("https://bsky.app/profile/fujoweb.dev/post/3abc"),
    ).toEqual({
      url: "https://bsky.app/profile/fujoweb.dev/post/3abc",
      platform: "bsky",
      username: "fujoweb.dev",
      icon: "simple-icons:bluesky",
    });
  });

  test("matches bsky.social as well as bsky.app", () => {
    const result = transformSocial("https://bsky.social/profile/fujoweb.dev");
    expect(result.platform).toBe("bsky");
    expect(result.username).toBe("fujoweb.dev");
  });

  test("normalizes uppercase URLs before matching", () => {
    const result = transformSocial("https://BSKY.APP/profile/FujoWeb.Dev");
    expect(result.platform).toBe("bsky");
    expect(result.username).toBe("fujoweb.dev");
  });

  test("accepts multi-label handles", () => {
    expect(
      transformSocial("https://bsky.app/profile/boba-tan.staging.bsky.dev")
        .username,
    ).toBe("boba-tan.staging.bsky.dev");
  });
});

describe("Bluesky: subdomain profile URLs", () => {
  test("extracts the subdomain as the username", () => {
    const result = transformSocial("https://fujoweb.bsky.app");
    expect(result.platform).toBe("bsky");
    expect(result.username).toBe("fujoweb");
  });

  test("works for the bsky.social subdomain form too", () => {
    const result = transformSocial("https://fujoweb.bsky.social/some/path");
    expect(result.platform).toBe("bsky");
    expect(result.username).toBe("fujoweb");
  });
});

describe("Bluesky: invalid handles fall through to `custom`", () => {
  test("rejects handles with consecutive dots", () => {
    expect(
      transformSocial("https://bsky.app/profile/bad..handle").platform,
    ).toBe("custom");
  });

  test("rejects single-label handles (HANDLE requires a dot)", () => {
    expect(transformSocial("https://bsky.app/profile/fujoweb").platform).toBe(
      "custom",
    );
  });

  test("rejects handles with a leading hyphen in a label", () => {
    expect(transformSocial("https://bsky.app/profile/-bad.dev").platform).toBe(
      "custom",
    );
  });

  test("does not match an unescaped-dot lookalike host", () => {
    expect(
      transformSocial("https://bskyyapp/profile/fujoweb.dev").platform,
    ).toBe("custom");
  });
});

describe("Bluesky: DID profile URLs", () => {
  test("recognizes a did:plc handle", () => {
    expect(transformSocial("https://bsky.app/profile/did:plc:b0b474n")).toEqual(
      {
        url: "https://bsky.app/profile/did:plc:b0b474n",
        platform: "bsky",
        username: "did:plc:b0b474n",
        icon: "simple-icons:bluesky",
      },
    );
  });

  test("recognizes a did:web handle", () => {
    const result = transformSocial(
      "https://bsky.app/profile/did:web:example.com",
    );
    expect(result.platform).toBe("bsky");
    expect(result.username).toBe("did:web:example.com");
  });

  // The DID pattern mirrors `@atproto/syntax`'s `ensureValidDidRegex`, which
  // allows upper-case ASCII in the method-specific identifier (for `did:web`
  // hosts and percent-encoding). Since this library lowercases profiles by
  //default, however, going directly through the common entry point would
  // make it impossible to test this case.
  // This is here to future proof and make sure that the uppercase remains
  // valid, even if we stop lowercasing.
  test("matches a mixed-case did:web via the raw case-sensitive matcher", () => {
    const url = "https://bsky.app/profile/did:web:FujoWeb.dev";
    expect(socialLinks.detectProfile(url)).toBe("bsky");
    expect(socialLinks.getProfileId("bsky", url)).toBe("did:web:FujoWeb.dev");
  });

  // The trailing-character anchor (`[a-zA-Z0-9._-]$`) forbids a DID ending in
  // `:` or `%`, so the matcher trims a stray trailing colon off the username.
  test("does not capture a trailing colon as part of the DID", () => {
    expect(
      transformSocial("https://bsky.app/profile/did:plc:abc123:").username,
    ).toBe("did:plc:abc123");
  });
});

describe("Bluesky via createTransformSocial", () => {
  test("a freshly created transformer matches Bluesky identically", () => {
    const { transformSocial: scoped } = createTransformSocial();
    expect(scoped("https://bsky.app/profile/fujoweb.dev")).toEqual({
      url: "https://bsky.app/profile/fujoweb.dev",
      platform: "bsky",
      username: "fujoweb.dev",
      icon: "simple-icons:bluesky",
    });
  });
});
