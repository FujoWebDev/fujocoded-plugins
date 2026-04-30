import type { AtpAgent } from "@atproto/api";
import { XRPCError } from "@atproto/xrpc";
import { createHash } from "node:crypto";

export const BADGE_COLLECTION = "community.lexicon.badge.award";
export const BADGE_DEFINITION_COLLECTION = "community.lexicon.badge.definition";

/**
 * Generate a deterministic record key for a badge award, so that concurrent
 * requests to award the same badge don't create duplicates.
 *
 * When writing a badge award to a PDS, pass the returned rkey as the
 * `rkey` parameter of `com.atproto.repo.putRecord`.
 *
 * Note: the rkey is derived from the badge definition URI only, without CID.
 * If a badge definition is updated in place (same URI, new CID), awarding
 * the updated badge to the same person will overwrite their existing award
 * via `putRecord`. This is intentional: one award per badge per person.
 */
export function getBadgeRkey({
  badgeDefinitionUri,
}: {
  badgeDefinitionUri: string;
}): string {
  const hash = createHash("sha256")
    .update(badgeDefinitionUri)
    .digest("base64url");
  // First 13 chars of SHA-256 hash, valid as an ATProto record key.
  return hash.slice(0, 13);
}

/**
 * Look up a badge award for a particular badge definition.
 *
 * Returns the record URI + its full value if found, or `null` if
 * they haven't been awarded this badge yet.
 *
 * The lookup is by badge definition URI only (via `getBadgeRkey`).
 * The returned `value` includes the badge ref, issued date, and
 * signatures, so you can do your own CID matching or display logic.
 *
 * Authentication is not required: any agent that can read from the
 * recipient's PDS will work.
 */
export async function getExistingBadgeAward({
  agent,
  did,
  badgeDefinitionUri,
}: {
  agent: AtpAgent;
  did: string;
  badgeDefinitionUri: string;
}): Promise<{ uri: string; value: Record<string, unknown> } | null> {
  const rkey = getBadgeRkey({ badgeDefinitionUri });
  try {
    const { data } = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: BADGE_COLLECTION,
      rkey,
    });
    return { uri: data.uri, value: data.value as Record<string, unknown> };
  } catch (err) {
    if (err instanceof XRPCError && err.error === "RecordNotFound") {
      return null;
    }
    throw err;
  }
}

/**
 * Check if a badge definition with the given name already exists on
 * a PDS.
 *
 * Returns the definition's `uri` and `cid` if found, or `null` if it
 * doesn't exist yet.
 *
 * Use this before `createBadgeDefinition` to avoid creating duplicates.
 *
 * Matching is byte-exact: `"Speaker"` and `"Speaker "` are different
 * badges, as are `"JS"` and `"js"`. Normalize on the caller side
 * (trim/casefold/NFC) if you want fuzzier dedup.
 */
export async function findExistingBadgeDefinition({
  agent,
  did,
  name,
}: {
  agent: AtpAgent;
  did: string;
  name: string;
}): Promise<{ uri: string; cid: string } | null> {
  let cursor: string | undefined;

  do {
    const { data } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: BADGE_DEFINITION_COLLECTION,
      limit: 100,
      cursor,
    });

    const existing = data.records.find((rec) => {
      const value = rec.value as Record<string, unknown>;
      return value.name === name;
    });

    if (existing) {
      return { uri: existing.uri, cid: existing.cid };
    }

    cursor = data.cursor;
  } while (cursor);

  return null;
}

/**
 * Create a new badge type on a PDS.
 *
 * A badge definition describes what the badge is (name + optional
 * description). You only need to create it once.
 *
 * Save the returned `uri` and `cid` and pass them to
 * `createBadgeAwardRecord` every time you award this badge to someone.
 */
export async function createBadgeDefinition({
  agent,
  did,
  name,
  description,
}: {
  agent: AtpAgent;
  did: string;
  name: string;
  description?: string;
}): Promise<{ uri: string; cid: string }> {
  const record: Record<string, unknown> = {
    $type: BADGE_DEFINITION_COLLECTION,
    name,
    createdAt: new Date().toISOString(),
  };
  if (description) {
    record.description = description;
  }

  const { data } = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: BADGE_DEFINITION_COLLECTION,
    record,
  });

  return { uri: data.uri, cid: data.cid };
}
