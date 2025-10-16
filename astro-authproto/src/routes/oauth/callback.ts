import type { APIRoute } from "astro";
import { oauthClient, getRedirectUrl } from "../../lib/auth.js";
import { redirectAfterLogin } from "fujocoded:authproto/config";

export const GET: APIRoute = async ({ params, request, redirect, session }) => {
  const requestUrl = new URL(request.url);
  const { session: oauthSession } = await oauthClient.callback(
    requestUrl.searchParams
  );

  session?.set("atproto-did", oauthSession.did);

  // Check if a custom redirect or referer was passed in the state
  // Note: CSRF validation is already handled by oauthClient.callback() above,
  // so it's safe to fall back to default redirect if state parsing fails here
  let customRedirect: string | undefined;
  let referer: string | undefined;
  const stateParam = requestUrl.searchParams.get("state");
  if (stateParam) {
    try {
      const stateData = JSON.parse(
        Buffer.from(stateParam, "base64url").toString()
      );
      customRedirect = stateData.redirect;
      referer = stateData.referer;
    } catch {
      // If custom redirect parsing fails, use default redirect
      // (CSRF protection is still validated by the OAuth client)
    }
  }

  const redirectTo = await getRedirectUrl({
    redirectToBase: customRedirect ?? redirectAfterLogin ?? "/",
    did: oauthSession.did,
    referer: referer ?? "",
  });

  return redirect(redirectTo);
};
