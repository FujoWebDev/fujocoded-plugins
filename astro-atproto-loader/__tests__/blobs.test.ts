import { CID } from "multiformats/cid";
import { describe, expect, test } from "vitest";

import { toHostedBlob, isAtBlob, type AtBlob } from "../src/blobs.ts";

const CID_LINK = "bafkreics4felvw3rnpwriv7avyvb3qdfutobmovlrskpbxshlmjkers6b4";

const SAMPLE: AtBlob = {
  $type: "blob",
  ref: { $link: CID_LINK },
  mimeType: "image/png",
  size: 12345,
};

// Matches the `BlobRef` class shape that `@atproto/api` returns: `ref` is a
// real `CID` instance, not a `{ $link }` plain object.
const BLOB_REF_INSTANCE = {
  $type: "blob" as const,
  ref: CID.parse(CID_LINK),
  mimeType: "image/png",
  size: 12345,
};

describe("toHostedBlob", () => {
  test("builds a getBlob URL from a resolved repo and a blob ref", () => {
    const result = toHostedBlob({
      repo: { did: "did:plc:abc123", pds: "https://pds.example.test" },
      blob: SAMPLE,
    });

    expect(result).toEqual({
      url: "https://pds.example.test/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc123&cid=bafkreics4felvw3rnpwriv7avyvb3qdfutobmovlrskpbxshlmjkers6b4",
      mimeType: "image/png",
      size: 12345,
    });
  });

  test("accepts BlobRef-style values where ref is a real CID instance", () => {
    const result = toHostedBlob({
      repo: { did: "did:plc:abc123", pds: "https://pds.example.test" },
      blob: BLOB_REF_INSTANCE,
    });

    expect(result?.url).toContain(`cid=${CID_LINK}`);
    expect(result?.mimeType).toBe("image/png");
    expect(result?.size).toBe(12345);
  });

  test("strips a single trailing slash from the PDS to avoid double slashes", () => {
    const result = toHostedBlob({
      repo: { did: "did:plc:abc123", pds: "https://pds.example.test/" },
      blob: SAMPLE,
    });

    expect(result.url).toMatch(/^https:\/\/pds\.example\.test\/xrpc\//);
  });

  test("encodes did and cid so they survive URL parsing", () => {
    const result = toHostedBlob({
      repo: { did: "did:web:example.com", pds: "https://pds.example.test" },
      blob: SAMPLE,
    });
    const url = new URL(result.url);

    expect(url.searchParams.get("did")).toBe("did:web:example.com");
    expect(url.searchParams.get("cid")).toBe(SAMPLE.ref.$link);
  });
});

describe("isAtBlob", () => {
  test("accepts a well-formed blob ref", () => {
    expect(isAtBlob(SAMPLE)).toBe(true);
  });

  test("accepts blobs without a $type discriminator", () => {
    const { $type: _ignored, ...rest } = SAMPLE;
    expect(isAtBlob(rest)).toBe(true);
  });

  test("accepts BlobRef-style values where ref is a real CID instance", () => {
    expect(isAtBlob(BLOB_REF_INSTANCE)).toBe(true);
  });

  test.each([
    ["null", null],
    ["string", "not a blob"],
    ["missing ref", { mimeType: "image/png", size: 1 }],
    ["missing mimeType", { ref: { $link: "x" }, size: 1 }],
    ["missing size", { ref: { $link: "x" }, mimeType: "image/png" }],
    [
      "ref that's a plain object (no $link, no CID)",
      { ref: {}, mimeType: "image/png", size: 1 },
    ],
    [
      "ref with a non-string $link and no CID marker",
      { ref: { $link: 42 }, mimeType: "image/png", size: 1 },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isAtBlob(value)).toBe(false);
  });
});
