import {
  type NodeSavedStateStore,
  type NodeSavedSession,
  type NodeSavedSessionStore,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { db, eq } from "astro:db";
import { AtProtoChallenges, AtProtoSessions } from "../db/tables.js";

/**
 * The StateStore saves the challenge token issued before an OAuth request to
 * the user's PDS is made. Once the OAuth authentication comes back with a
 * response, the challenge token is validated. If everything goes well, the
 * token is then deleted, and the user is authenticated.
 */
export class StateStore implements NodeSavedStateStore {
  /* Fulfills a request for the token */
  async get(key: string): Promise<NodeSavedState | undefined> {
    const result = await db
      .select()
      .from(AtProtoChallenges)
      .where(eq(AtProtoChallenges.key, key))
      .limit(1);

    if (!result?.length) return;

    return JSON.parse(result[0].state!) as NodeSavedState;
  }
  /* Fulfills a request to set the token */
  async set(key: string, state: NodeSavedState) {
    const stringState = JSON.stringify(state);
    await db
      .insert(AtProtoChallenges)
      .values({ key, state: stringState })
      .onConflictDoUpdate({
        target: AtProtoChallenges.key,
        set: { state: stringState },
      });
  }
  /* Fulfills a request to delete the token */
  async del(key: string) {
    await db.delete(AtProtoChallenges).where(eq(AtProtoChallenges.key, key));
  }
}

/**
 * The SessionStore stores the authentication credential of a user, and
 * helps the program access them given the user' DID.
 */
export class SessionStore implements NodeSavedSessionStore {
  /* Fulfills a request to get the credential of the user, given a DID */
  async get(did: string): Promise<NodeSavedSession | undefined> {
    const result = await db
      .select()
      .from(AtProtoSessions)
      .where(eq(AtProtoSessions.did, did))
      .limit(1);

    if (!result?.length) return;

    return JSON.parse(result[0].session!) as NodeSavedSession;
  }
  /* Fulfills a request to set the credential of the user, given a DID */
  async set(did: string, val: NodeSavedSession) {
    const session = JSON.stringify(val);
    await db
      .insert(AtProtoSessions)
      .values({ did, session })
      .onConflictDoUpdate({
        target: AtProtoSessions.did,
        set: { session },
      });
  }
  /* Fulfills a request to delete the credential of the user, given a DID */
  async del(did: string) {
    await db.delete(AtProtoSessions).where(eq(AtProtoSessions.did, did));
  }
}
