import {
  type NodeSavedStateStore,
  type NodeSavedSession,
  type NodeSavedSessionStore,
  type NodeSavedState,
} from "@atproto/oauth-client-node";

import { storage } from "fujocoded:authproto/config";

/**
 * The StateStore saves the challenge token issued before an OAuth request to
 * the user's PDS is made. Once the OAuth authentication comes back with a
 * response, the challenge token is validated. If everything goes well, the
 * token is then deleted, and the user is authenticated.
 */
export class StateStore implements NodeSavedStateStore {
  /* Fulfills a request for the token */
  async get(key: string): Promise<NodeSavedState | undefined> {
    try {
      const result = await storage.getItem(`authproto:state:${key}`);
      return result as NodeSavedState;
    } catch (e) {
      return undefined;
    }
  }
  /* Fulfills a request to set the token */
  async set(key: string, val: NodeSavedState) {
    await storage.setItem(`authproto:state:${key}`, val);
  }
  /* Fulfills a request to delete the token */
  async del(key: string) {
    await storage.del(`authproto:state:${key}`);
  }
}

/**
 * The SessionStore stores the authentication credential of a user, and
 * helps the program access them given the user' DID.
 */
export class SessionStore implements NodeSavedSessionStore {
  /* Fulfills a request to get the credential of the user, given a DID */
  async get(did: string): Promise<NodeSavedSession | undefined> {
    const result = await storage.getItem(`authproto:session:${did}`);
    return result as NodeSavedSession;
  }
  /* Fulfills a request to set the credential of the user, given a DID */
  async set(did: string, val: NodeSavedSession) {
    await storage.setItem(`authproto:session:${did}`, val);
  }
  /* Fulfills a request to delete the credential of the user, given a DID */
  async del(did: string) {
    await storage.del(`authproto:session:${did}`);
  }
}
