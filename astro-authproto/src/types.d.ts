/// <reference types="astro/client" />

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

declare module "fujocoded:authproto/config" {
  export const applicationName: string;
  export const applicationDomain: string;
  export const defaultDevUser: string | null;
  export const storage: import("unstorage").Storage;
  export const scopes: import("./lib/config.ts").OAuthScope[];
  export const driverName: import("./lib/config.ts").AllDriverOptions["name"];
}

export {};
