import {
  type NodeSavedStateStore,
  type NodeSavedSession,
  type NodeSavedSessionStore,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const TOKEN_FOLDER = ".tokens/bsky";
const AUTH_STATE_FILE = "auth-state.json";
const AUTH_SESSION_FILE = "auth-session.json";

/**
 * Path to save the challenge tokens in, given the token key.
 */
const getChallengePath = ({ key }: { key: string }) =>
  path.join(TOKEN_FOLDER, "challenges", key, AUTH_STATE_FILE);

/**
 * Path to save the user authentication in, given their DID.
 */
const getSessionPath = ({ did }: { did: string }) =>
  path.join(TOKEN_FOLDER, "sessions", did, AUTH_SESSION_FILE);

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
      return JSON.parse((await readFile(getChallengePath({ key }))).toString());
    } catch (e) {
      return undefined;
    }
  }
  /* Fulfills a request to set the token */
  async set(key: string, val: NodeSavedState) {
    const state = JSON.stringify(val);
    const challengePath = getChallengePath({ key });
    const challengeDirectory = path.dirname(challengePath);
    await mkdir(challengeDirectory, {
      recursive: true,
    });
    await writeFile(challengePath, state);
  }
  /* Fulfills a request to delete the token */
  async del(key: string) {
    await rm(getChallengePath({ key }));
  }
}

/**
 * The SessionStore stores the authentication credential of a user, and
 * helps the program access them given the user' DID.
 */
export class SessionStore implements NodeSavedSessionStore {
  /* Fulfills a request to get the credential of the user, given a DID */
  async get(did: string): Promise<NodeSavedSession | undefined> {
    return JSON.parse((await readFile(getSessionPath({ did }))).toString());
  }
  /* Fulfills a request to set the credential of the user, given a DID */
  async set(did: string, val: NodeSavedSession) {
    const session = JSON.stringify(val);
    const sessionPath = getSessionPath({ did });
    const sessionDirectory = path.dirname(sessionPath);
    await mkdir(sessionDirectory, {
      recursive: true,
    });
    await writeFile(sessionPath, session);
  }
  /* Fulfills a request to delete the credential of the user, given a DID */
  async del(did: string) {
    await rm(getSessionPath({ did }));
  }
}
