import type { APIRoute } from "astro";
import { extractAuthError, oauthClient } from "../../lib/auth.js";
import { getRedirectUrl } from "../../lib/redirects.js";
import { redirectAfterLogin } from "fujocoded:authproto/config";
import {
  AUTHPROTO_ERROR_DESCRIPTION,
  AUTHPROTO_ERROR_CODE,
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
  console.dir(requestUrl);

  let oauthSession: OAuthSession | null;
  let error = requestUrl.searchParams.get("error");
  // This falls back to undefined so it will be compatible with the session
  // storage signature if not present.
  let errorDescription =
    requestUrl.searchParams.get("error_description") ?? undefined;
  try {
    const clientCallback = await oauthClient.callback(requestUrl.searchParams);
    oauthSession = clientCallback.session;
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

  // Check if a custom redirect or referer was passed in the state
  // Note: CSRF validation is already handled by oauthClient.callback() above,
  // so it's safe to fall back to default redirect if state parsing fails here
  let customRedirect: string | undefined;
  let referer: string | undefined;
  const stateParam = requestUrl.searchParams.get("state");
  if (stateParam) {
    try {
      const stateData = JSON.parse(
        Buffer.from(stateParam, "base64url").toString(),
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
