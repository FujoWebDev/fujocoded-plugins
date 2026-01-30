declare global {
  namespace App {
    interface SessionData {
      "atproto-did": string | undefined;
    }

    interface Locals {
      loggedInUser: {
        did: string;
        handle: string;
        fetchHandler: import("@atproto/oauth-client-node").OAuthSession["fetchHandler"];
      } | null;
    }
  }
}

export {};
