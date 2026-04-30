import type { APIRoute } from "astro";
import { extractAuthError, oauthClient } from "../../lib/auth.js";
import { getRedirectUrl } from "../../lib/redirects.js";
import { redirectAfterLogin } from "fujocoded:authproto/config";
import {
  AUTHPROTO_ERROR_DESCRIPTION,
  AUTHPROTO_ERROR_CODE,
} from "../middleware.ts";
import { type OAuthSession } from "@atproto/oauth-client-node";

export const GET: APIRoute = async ({ request, redirect, session }) => {
  const requestUrl = new URL(request.url);

  let oauthSession: OAuthSession | null;
  let oauthState: string | null = null;
  let error = requestUrl.searchParams.get("error");
  // This falls back to undefined so it will be compatible with the session
  // storage signature if not present.
  let errorDescription =
    requestUrl.searchParams.get("error_description") ?? undefined;
  try {
    const clientCallback = await oauthClient.callback(requestUrl.searchParams);
    oauthSession = clientCallback.session;
    oauthState = clientCallback.state;
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

  // The `state` value in the URL is NOT the state we sent during login: the
  // OAuth client swaps it for its own internal id. Our original state comes
  // back as `clientCallback.state`, so that's what we read.
  // CSRF was already validated by oauthClient.callback() above, so if parsing
  // fails here it's safe to fall back to the default redirect.
  let customRedirect: string | undefined;
  let referer: string | undefined;
  if (oauthState) {
    try {
      const stateData = JSON.parse(
        Buffer.from(oauthState, "base64url").toString(),
      );
      customRedirect = stateData.redirect;
      referer = stateData.referer;
    } catch {
      // If custom redirect parsing fails, use default redirect
      // (CSRF protection is still validated by the OAuth client)
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
