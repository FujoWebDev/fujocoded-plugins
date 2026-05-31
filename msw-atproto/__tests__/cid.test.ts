import { CID } from "multiformats";
import { describe, expect, it } from "vitest";

import { fakeCid } from "../src/index.ts";

describe("fakeCid", () => {
  it("returns the same parseable CIDv1 for the same input", () => {
    const input = 'did:plc:repo/app.bsky.feed.post/rkey:{"text":"hi"}';
    const cid = fakeCid(input);

    expect(fakeCid(input)).toBe(cid);
    expect(CID.parse(cid).version).toBe(1);
  });
});
