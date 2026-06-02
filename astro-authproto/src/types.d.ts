import type { AuthprotoSessionData } from "./lib/session-state.js";
import type { OAuthScope } from "./lib/config.js";
declare global {
  namespace App {
    interface SessionData extends AuthprotoSessionData {}

    interface Locals {
      /**
       * The logged-in ATproto user for this request, or `null` when the visitor
       * is logged out.
       */
      loggedInUser: {
        /**
         * The user's DID, the stable account id used by ATproto.
         */
        did: string;
        /**
         * The user's current handle.
         */
        handle: string;
        /**
         * The scopes granted for this session. This can be narrower than the
         * scopes you asked for, as it drops undeclared permissions.
         */
        scopes: OAuthScope[];
        /**
         * Fetches ATproto requests as the logged-in user.
         */
        fetchHandler: import("@atproto/oauth-client-node").OAuthSession["fetchHandler"];
      } | null;
      /**
       * The raw OAuth session for advanced server-side ATproto calls.
       */
      loggedInClient: import("@atproto/oauth-client-node").OAuthSession | null;
      /**
       * One-shot Authproto status for the current request. Login errors appear
       * here once, then Authproto clears them from the session.
       */
      authproto: {
        /**
         * The handle submitted by the user, when Authproto has one.
         */
        attemptedHandle?: string;
        /**
         * Human-readable login failure text.
         */
        errorDescription?: string;
        /**
         * Machine-readable login failure code.
         */
        errorCode?: string;
        /**
         * Provider documentation URL for the login failure, when available.
         */
        errorUri?: string;
      } | null;
    }
  }
}

export {};
