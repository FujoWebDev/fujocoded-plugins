import type { APIRoute } from "astro";
import { applicationName, applicationDomain } from "fujocoded:authproto/config";

const IS_DEVELOPMENT = import.meta.env.DEV;
// The domain most appropriate for the environment we are in, i.e. localhost
// if in dev, or else the application domain.
const ENV_DOMAIN = IS_DEVELOPMENT ? "http://localhost:4321" : applicationDomain;
const ALLOWED_SCOPES = "atproto transition:generic";
const REDIRECT_PATH = "/oauth/callback";

const LOCAL_SEARCH_PARAMS = new URLSearchParams({
  scope: ALLOWED_SCOPES,
  redirect_uri: new URL(REDIRECT_PATH, ENV_DOMAIN).toString(),
});

export const GET: APIRoute = async ({}) => {
  return new Response(
    JSON.stringify({
      client_name: applicationName,
      client_id: IS_DEVELOPMENT
        ? `http://localhost?${LOCAL_SEARCH_PARAMS.toString()}`
        : new URL("/client-metadata.json", applicationDomain).toString(),
      client_uri: applicationDomain,
      redirect_uris: [new URL(REDIRECT_PATH, ENV_DOMAIN).toString()],
      scope: ALLOWED_SCOPES,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "none",
      dpop_bound_access_tokens: true,
      jwks_uri: new URL("/jwks.json", ENV_DOMAIN).toString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};
