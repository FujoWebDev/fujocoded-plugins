import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { create as createDigest } from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";
import { createHash } from "node:crypto";

/**
 * A valid CIDv1 string that parses with `multiformats/cid`.
 *
 * Use this when a test needs a single placeholder CID and does not care about
 * content. Use `fakeCid(input)` instead when several values need stable but
 * different CIDs.
 */
export const FAKE_CID =
  "bafyreidfayvfuwqa7qlnopdjiqrxzs6blmoeu4rujcjtnci5beludirz2a";

/**
 * Builds a stable, parseable CIDv1 string from a test input.
 *
 * The same input always returns the same CID, so two records seeded with the
 * same content get the same CID. Use this when test assertions compare CIDs
 * across reads, or when fake records need to look different from one another.
 */
export const fakeCid = (input: string): string =>
  CID.createV1(
    raw.code,
    createDigest(sha256.code, createHash("sha256").update(input).digest()),
  ).toString();

/**
 * Returns the same CID `createMockAtprotoRepo` derives for any record with no
 * explicit `cid`, whether seeded up front or written during the test via
 * `createRecord`, `putRecord`, or `applyWrites`. Use this in assertions that
 * compare against the CID the fake generates.
 *
 * Two records with the same `{ repo, collection, rkey, value }` get the same
 * CID, so a follow-up read can be matched without round-tripping the CID
 * through the fake first.
 */
export const cidForRecord = ({
  repo,
  collection,
  rkey,
  value,
}: {
  repo: string;
  collection: string;
  rkey: string;
  value: Record<string, unknown>;
}): string =>
  fakeCid([repo, collection, rkey, JSON.stringify(value)].join("\n"));
