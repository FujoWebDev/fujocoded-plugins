import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";

import { DidResolver } from "@atproto/identity";
import { scopes, driverName } from "fujocoded:authproto/config";

const REDIRECT_PATH = "/oauth/callback";

let Stores;
if (driverName == "astro:db") {
  Stores = await import("./auth-storage-db.js");
} else {
  Stores = await import("./auth-storage-unstorage.js");
}

const createClient = async (domain: string) => {
  // In local clients configuration for allowed scopes and redirects
  // is done through search params
  // See: https://atproto.com/specs/oauth#clients
  const LOCAL_SEARCH_PARAMS = new URLSearchParams({
    scope: scopes.join(" "),
    redirect_uri: new URL(REDIRECT_PATH, domain).toString(),
  });
  // @ts-expect-error
  const IS_DEVELOPMENT = import.meta.env.DEV;

  return new NodeOAuthClient({
    clientMetadata: {
      client_name: "ATProto Guestbook",
      client_id: IS_DEVELOPMENT
        ? `http://localhost?${LOCAL_SEARCH_PARAMS.toString()}`
        : new URL("/client-metadata.json", domain).toString(),
      client_uri: domain,
      redirect_uris: [new URL(REDIRECT_PATH, domain).toString()],
      scope: scopes.join(" "),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "none",
      dpop_bound_access_tokens: true,
      jwks_uri: new URL("/jwks.json", domain).toString(),
    },
    keyset: await Promise.all([JoseKey.generate()]),
    stateStore: new Stores.StateStore(),
    sessionStore: new Stores.SessionStore(),
  });
};

const DOMAIN = process.env.EXTERNAL_DOMAIN ?? "http://127.0.0.1:4321/";
export const oauthClient = await createClient(DOMAIN);

const IDENTITY_RESOLVER = new DidResolver({});
export const didToHandle = async (did: string) => {
  const atprotoData = await IDENTITY_RESOLVER.resolveAtprotoData(did);
  return atprotoData.handle;
};
