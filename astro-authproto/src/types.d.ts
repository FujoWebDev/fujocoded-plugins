import { AUTHPROTO_ERROR_CODE, AUTHPROTO_ERROR_DESCRIPTION, AUTHPROTO_SCOPES } from "./routes/middleware.ts";
declare global {
  namespace App {
    interface SessionData {
      "atproto-did": string | undefined;
      [AUTHPROTO_SCOPES]: string[] | undefined;
      [AUTHPROTO_ERROR_CODE]: string | undefined;
      [AUTHPROTO_ERROR_DESCRIPTION]: string | undefined;
    }

    interface Locals {
      loggedInUser: {
        did: string;
        handle: string;
        scopes: string[];
        fetchHandler: import("@atproto/oauth-client-node").OAuthSession["fetchHandler"];
      } | null;
      authproto: {
        attemptedHandle?: string;
        errorDescription?: string;
        errorCode?: string;
      } | null;
    }
  }
}

export {};
