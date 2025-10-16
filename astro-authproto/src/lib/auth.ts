import {
  NodeOAuthClient,
  type NodeOAuthClientOptions,
} from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";

import { DidResolver } from "@atproto/identity";
import {
  scopes,
  driverName,
  applicationName,
  externalDomain,
} from "fujocoded:authproto/config";
import { LOGGED_IN_HANDLE_TEMPLATE } from "../index.js";
import { REDIRECT_TO_REFERER_TEMPLATE } from "../index.js";
import { LOGGED_IN_DID_TEMPLATE } from "../index.js";

const REDIRECT_PATH = "/oauth/callback";

let Stores;
if (driverName == "astro:db") {
  Stores = await import("./auth-storage-db.js");
} else {
  Stores = await import("./auth-storage-unstorage.js");
}

/**
 * Creates OAuth client metadata for the given domain.
 * This is used both by the OAuth client and the client-metadata.json endpoint.
 */
export const createClientMetadata = (
  domain: string
): NodeOAuthClientOptions["clientMetadata"] => {
  const DOMAIN_URL = new URL(domain);
  const IS_LOCALHOST =
    DOMAIN_URL.hostname === "127.0.0.1" || DOMAIN_URL.hostname === "localhost";

  const ENDPOINT_URL = IS_LOCALHOST
    ? (() => {
        const loopback = new URL(domain);
        loopback.hostname = "127.0.0.1";
        return loopback;
      })()
    : DOMAIN_URL;

  // In local clients configuration for allowed scopes and redirects
  // is done through search params. In that case, the client ID must
  // be "http://localhost" but the redirect_uri must use 127.0.0.1 (RFC 8252).
  // See: https://atproto.com/specs/oauth#clients
  const CLIENT_ID = new URL(IS_LOCALHOST ? "http://localhost" : DOMAIN_URL);
  if (IS_LOCALHOST) {
    CLIENT_ID.searchParams.set("scope", scopes.join(" "));
    CLIENT_ID.searchParams.set(
      "redirect_uri",
      new URL(REDIRECT_PATH, ENDPOINT_URL).toString()
    );
  }

  return {
    client_name: applicationName,
    client_id: IS_LOCALHOST
      ? CLIENT_ID.href
      : new URL("/client-metadata.json", CLIENT_ID).toString(),
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
    keyset: await Promise.all([JoseKey.generate()]),
    stateStore: new Stores.StateStore(),
    sessionStore: new Stores.SessionStore(),
  });
};

const DOMAIN =
  externalDomain ?? process.env.EXTERNAL_DOMAIN ?? "http://127.0.0.1:4321/";
export const oauthClient = await createClient(DOMAIN);

const IDENTITY_RESOLVER = new DidResolver({});
export const didToHandle = async (did: string) => {
  const atprotoData = await IDENTITY_RESOLVER.resolveAtprotoData(did);
  return atprotoData.handle;
};

export const getRedirectUrl = async ({
  redirectToBase,
  did,
  referer,
}: {
  redirectToBase: string;
  did: string;
  referer: string;
}) => {
  let redirectTo = redirectToBase;

  if (referer && redirectTo.includes(REDIRECT_TO_REFERER_TEMPLATE)) {
    // The redirectTo might already have a query string, so we need to split it and handle both parts
    let [basePath, baseParams] = redirectTo.split("?");

    console.dir({ basePath, baseParams }, { depth: null });
    console.dir({ referer }, { depth: null });

    let [refererBasePath, refererParams] = referer.split("?");

    // As the first step, we figure out if the base path itself has the referer template
    // In which case we need to special handle the referer search params so they
    // are a base for the new redirectTo
    if (basePath.includes(REDIRECT_TO_REFERER_TEMPLATE)) {
      basePath = basePath.replaceAll(
        REDIRECT_TO_REFERER_TEMPLATE,
        refererBasePath
      );
    }
    const finalSearchParams = new URLSearchParams(refererParams);

    if (baseParams) {
      const searchParams = new URLSearchParams(baseParams);
      // Merge base params, replacing any referer template variables
      for (const [key, value] of searchParams.entries()) {
        if (value.includes(REDIRECT_TO_REFERER_TEMPLATE)) {
          finalSearchParams.set(
            key,
            value.replaceAll(
              REDIRECT_TO_REFERER_TEMPLATE,
              encodeURIComponent(referer)
            )
          );
        } else {
          finalSearchParams.set(key, value);
        }
      }
    }

    redirectTo = `${basePath}${finalSearchParams.size > 0 ? `?${finalSearchParams.toString()}` : ""}`;
  }

  // Substitute template variables with logged-in user data
  if (redirectTo.includes(LOGGED_IN_DID_TEMPLATE)) {
    redirectTo = redirectTo.replaceAll(LOGGED_IN_DID_TEMPLATE, did);
  }

  if (redirectTo.includes(LOGGED_IN_HANDLE_TEMPLATE)) {
    const handle = await didToHandle(did);
    redirectTo = redirectTo.replaceAll(LOGGED_IN_HANDLE_TEMPLATE, handle);
  }

  return redirectTo;
};
