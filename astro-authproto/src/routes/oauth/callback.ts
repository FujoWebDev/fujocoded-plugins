import type { APIRoute } from "astro";
import { extractAuthError, oauthClient } from "../../lib/auth.js";
import { getRedirectUrl } from "../../lib/redirects.js";
import { redirectAfterLogin } from "fujocoded:authproto/config";
import {
  AUTHPROTO_ERROR_DESCRIPTION,
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_SCOPES,
} from "../middleware.ts";
import { type OAuthSession } from "@atproto/oauth-client-node";

export const GET: APIRoute = async ({
  params,
  request,
  redirect,
  session,
  locals,
}) => {
  const requestUrl = new URL(request.url);

  let oauthSession: OAuthSession | null;
  let appState: string | null = null;
  let error = requestUrl.searchParams.get("error");
  // This falls back to undefined so it will be compatible with the session
  // storage signature if not present.
  let errorDescription =
    requestUrl.searchParams.get("error_description") ?? undefined;
  try {
    const clientCallback = await oauthClient.callback(requestUrl.searchParams);
    oauthSession = clientCallback.session;
    appState = clientCallback.state;
    session?.set("atproto-did", oauthSession.did);
  } catch (e) {
    // If there is an error during session restoration then it takes precedence
    // over the one in the searchParams
    const authError = extractAuthError(e);
    error = authError.code ?? error;
    errorDescription = authError.description;
    oauthSession = null;
  }

  if (error || errorDescription) {
    session?.set(AUTHPROTO_ERROR_CODE, error ?? "UNKNOWN");
    session?.set(AUTHPROTO_ERROR_DESCRIPTION, errorDescription);
  }

  // The OAuth client returns our app state (passed during authorize) via
  // clientCallback.state. The URL's "state" param is the library's internal nonce.
  let customRedirect: string | undefined;
  let referer: string | undefined;
  if (appState) {
    try {
      const stateData = JSON.parse(
        Buffer.from(appState, "base64url").toString(),
      );
      customRedirect = stateData.redirect;
      referer = stateData.referer;
      if (Array.isArray(stateData.scopes)) {
        session?.set(AUTHPROTO_SCOPES, stateData.scopes);
      }
    } catch {
      // If state parsing fails, fall back to default redirect
    }
  }

  const redirectTo = oauthSession
    ? await getRedirectUrl({
        redirectToBase: customRedirect ?? redirectAfterLogin ?? "/",
        did: oauthSession.did,
        referer: referer ?? "",
      })
    : (referer ?? "/");

  return redirect(redirectTo);
};
