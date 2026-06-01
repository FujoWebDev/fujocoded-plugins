import {
  NodeOAuthClient,
  type NodeOAuthClientOptions,
} from "@atproto/oauth-client-node";
import { requestLocalLock } from "@atproto/oauth-client";
import { JoseKey } from "@atproto/jwk-jose";

import { DidResolver, HandleResolver } from "@atproto/identity";
import {
  scopes,
  applicationName,
  clientMetadataDomain,
} from "fujocoded:authproto/config";

// We import the stores from the virtual module "fujocoded:authproto/stores"
// so we don't force projects using this integration to bundle all our dependencies,
// even for stores they don't use. Doing otherwise would cause errors if the consumer
// is (for example) NOT using "astro:db", but our code requires it for the bundle.
import * as Stores from "fujocoded:authproto/stores";

const REDIRECT_PATH = "/oauth/callback";

/**
 * Creates OAuth client metadata for the given domain.
 * This is used both by the OAuth client and the client-metadata.json endpoint.
 */
export const createClientMetadata = (
  domain: string,
): NodeOAuthClientOptions["clientMetadata"] => {
  const ENDPOINT_URL = new URL(domain);
  const IS_LOCALHOST =
    ENDPOINT_URL.hostname === "127.0.0.1" ||
    ENDPOINT_URL.hostname === "localhost";
  if (IS_LOCALHOST) {
    // RFC 8252 requires the redirect_uri to use 127.0.0.1 (not "localhost").
    ENDPOINT_URL.hostname = "127.0.0.1";
  }

  // In local clients configuration for allowed scopes and redirects
  // is done through search params. In that case, the client ID must
  // be "http://localhost" but the redirect_uri must use 127.0.0.1 (RFC 8252).
  // See: https://atproto.com/specs/oauth#clients
  const CLIENT_ID = new URL(IS_LOCALHOST ? "http://localhost" : domain);
  if (IS_LOCALHOST) {
    CLIENT_ID.searchParams.set("scope", scopes.join(" "));
    CLIENT_ID.searchParams.set(
      "redirect_uri",
      new URL(REDIRECT_PATH, ENDPOINT_URL).toString(),
    );
  }

  return {
    client_name: applicationName,
    client_id: IS_LOCALHOST
      ? CLIENT_ID.href
      : new URL("/oauth-client-metadata.json", CLIENT_ID).toString(),
    client_uri: ENDPOINT_URL.href,
    redirect_uris: [new URL(REDIRECT_PATH, ENDPOINT_URL).href],
    scope: scopes.join(" "),
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
    jwks_uri: new URL("/jwks.json", ENDPOINT_URL).toString(),
  } as const;
};

const createClient = async (domain: string) => {
  return new NodeOAuthClient({
    clientMetadata: createClientMetadata(domain),
    fetch: (input, init) => globalThis.fetch(input, init),
    keyset: [await JoseKey.generate()],
    stateStore: new Stores.StateStore(),
    sessionStore: new Stores.SessionStore(),
    requestLock: requestLocalLock,
  });
};

let oauthClient: Promise<NodeOAuthClient> | undefined;

export const getOAuthClient = () => {
  oauthClient ??= createClient(clientMetadataDomain);
  return oauthClient;
};

const IDENTITY_RESOLVER = new DidResolver({});
const HANDLE_RESOLVER = new HandleResolver({});
export const didToHandle = async (did: string) => {
  const atprotoData = await IDENTITY_RESOLVER.resolveAtprotoData(did);
  return atprotoData.handle;
};

/**
 * Resolves whatever the user typed into the login form (a handle or a DID) to
 * the canonical DID and handle pair. Instant when the missing half is the only
 * lookup; throws when a handle can't be resolved to a DID.
 */
export const resolveAtprotoIdentity = async (
  atprotoId: string,
): Promise<{ did: string; handle: string }> => {
  if (atprotoId.startsWith("did:")) {
    return { did: atprotoId, handle: await didToHandle(atprotoId) };
  }
  const did = await HANDLE_RESOLVER.resolve(atprotoId);
  if (!did) {
    throw new Error(`Could not resolve handle "${atprotoId}" to a DID`);
  }
  return { did, handle: atprotoId };
};

// The `"UNKNOWN" | (string & {})` return literal preserves IDE autocomplete
// for the known code while still accepting any other Error.name.
export const extractAuthError = (
  e: unknown,
): { code: "UNKNOWN" | (string & {}); description: string | undefined } => {
  if (e instanceof Error) {
    return {
      code: e.name ?? "UNKNOWN",
      description: e.message,
    };
  }
  return {
    code: "UNKNOWN",
    description: undefined,
  };
};
