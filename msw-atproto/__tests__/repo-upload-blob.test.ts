import { CID } from "multiformats";
import { describe, expect, it } from "vitest";

import { DID, fetchJson, PDS, setupRepo } from "./support.ts";

type BlobRef = {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
};

type UploadBlobBody = { blob: BlobRef };

const uploadBlob = (body: BodyInit, contentType: string) =>
  fetchJson<UploadBlobBody>(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });

const getBlobUrl = (cid: string, did = DID) =>
  `${PDS}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${cid}`;

describe("uploadBlob", () => {
  it("returns a parseable CIDv1 BlobRef and reports the byte size", async () => {
    setupRepo({ did: DID, pds: PDS });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const upload = await uploadBlob(bytes, "image/png");

    expect(upload.body.blob).toMatchObject({
      $type: "blob",
      mimeType: "image/png",
      size: bytes.byteLength,
    });
    expect(upload.body.blob.ref.$link).toMatch(/^baf/);
    expect(CID.parse(upload.body.blob.ref.$link).version).toBe(1);
  });

  it("makes the uploaded blob retrievable through com.atproto.sync.getBlob", async () => {
    setupRepo({ did: DID, pds: PDS });
    const bytes = new Uint8Array([10, 20, 30]);

    const upload = await uploadBlob(bytes, "application/octet-stream");
    const cid = upload.body.blob.ref.$link;

    const response = await fetch(getBlobUrl(cid));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    const fetched = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(fetched)).toEqual([10, 20, 30]);
  });

  it("produces stable CIDs for identical content and contentType", async () => {
    setupRepo({ did: DID, pds: PDS });
    const bytes = new Uint8Array([7, 7, 7]);

    const first = await uploadBlob(bytes, "image/jpeg");
    const second = await uploadBlob(new Uint8Array([7, 7, 7]), "image/jpeg");

    expect(second.body.blob.ref.$link).toBe(first.body.blob.ref.$link);
  });

  it("produces different CIDs when the contentType differs", async () => {
    setupRepo({ did: DID, pds: PDS });
    const bytes = new Uint8Array([1, 2, 3]);

    const png = await uploadBlob(bytes, "image/png");
    const jpeg = await uploadBlob(bytes, "image/jpeg");

    expect(jpeg.body.blob.ref.$link).not.toBe(png.body.blob.ref.$link);
  });

  it("defaults to application/octet-stream when no content-type is sent", async () => {
    setupRepo({ did: DID, pds: PDS });
    const bytes = new Uint8Array([42]);

    const response = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      body: bytes,
    });
    const body = (await response.json()) as UploadBlobBody;

    expect(body.blob.mimeType).toBe("application/octet-stream");
  });
});
