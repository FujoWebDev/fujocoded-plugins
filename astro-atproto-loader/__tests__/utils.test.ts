import { BlobRef } from "@atproto/api";
import { CID } from "multiformats/cid";
import { describe, expect, test } from "vitest";

import { toSafePojo } from "../src/utils.ts";

const CID_LINK = "bafkreics4felvw3rnpwriv7avyvb3qdfutobmovlrskpbxshlmjkers6b4";

describe("toSafePojo", () => {
  test("flattens AtProto CID/BlobRef instances into DAG-JSON form", () => {
    const cid = CID.parse(CID_LINK);
    const blobRef = new BlobRef(cid, "image/png", 10994);

    const result = toSafePojo({
      spriteSheet: blobRef,
      thumbnail: cid,
    });

    expect(result).toEqual({
      spriteSheet: {
        $type: "blob",
        ref: { $link: CID_LINK },
        mimeType: "image/png",
        size: 10994,
      },
      thumbnail: { $link: CID_LINK },
    });
  });

  test("preserves Date instances (devalue handles them natively)", () => {
    const createdAt = new Date("2026-04-07T22:24:18.550Z");
    const result = toSafePojo({ createdAt });
    expect(result.createdAt).toBe(createdAt);
  });
});
