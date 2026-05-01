/**
 * The shape a blob ref takes after JSON normalization, which we need to
 * make Astro happy. `$type` is optional because not every PDS bothers
 * to round-trip it.
 */
export interface AtBlob {
  $type?: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

const extractBlobLink = (ref: unknown): string | undefined => {
  if (typeof ref !== "object" || ref === null) return undefined;
  const link = (ref as { $link?: unknown }).$link;
  if (typeof link === "string") return link;
  // multiformats marks valid CID instances with `asCID === self`. CID's
  // toString() returns the link, same as the `$link` field above.
  if ((ref as { asCID?: unknown }).asCID === ref) {
    return (ref as { toString(): string }).toString();
  }
  return undefined;
};

/**
 * Narrow a record-value field into an `AtBlob`. Useful when `parseRecord`
 * left the field as `unknown`.
 */
export const isAtBlob = (value: unknown): value is AtBlob => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.mimeType !== "string") return false;
  if (typeof v.size !== "number") return false;
  return extractBlobLink(v.ref) !== undefined;
};

export interface HostedBlob {
  url: string;
  mimeType: string;
  size: number;
}

/**
 * Build a `getBlob` URL for a blob ref. Synchronous, since the caller has
 * the owning DID and PDS in hand: from `args.repo` for the record being
 * iterated, or from the `repo` field on a `fetchRecord` result for a
 * hydrated foreign record.
 *
 * Pass a typed `AtBlob` as `blob` and the return is always defined. Pass
 * `unknown` and the helper guards with `isAtBlob` internally, returning
 * `undefined` for non-blobs.
 */
export function toHostedBlob(args: {
  repo: { did: string; pds: string };
  blob: AtBlob;
}): HostedBlob;
export function toHostedBlob(args: {
  repo: { did: string; pds: string };
  blob: unknown;
}): HostedBlob | undefined;
export function toHostedBlob({
  repo,
  blob,
}: {
  repo: { did: string; pds: string };
  blob: unknown;
}): HostedBlob | undefined {
  if (!isAtBlob(blob)) return undefined;
  const link = extractBlobLink(blob.ref);
  if (!link) return undefined;
  const url = new URL("/xrpc/com.atproto.sync.getBlob", repo.pds);
  url.searchParams.set("did", repo.did);
  url.searchParams.set("cid", link);
  return {
    url: url.toString(),
    mimeType: blob.mimeType,
    size: blob.size,
  };
}
