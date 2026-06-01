import type { APIRoute } from "astro";
import { TokenRefreshError } from "@atproto/oauth-client";
import { getOAuthClient } from "../../lib/auth.js";
import { getRedirectUrl } from "../../lib/redirects.js";
import { redirectAfterLogout } from "fujocoded:authproto/config";
import {
  clearSessionGrant,
  readSessionGrant,
} from "../../lib/session-state.js";

// @atproto/oauth-client's SessionGetter throws TokenRefreshError with this
// message when the stored OAuth session was already removed elsewhere. The
// library does not expose a reason code, so keep this paired with the error
// type and DID checks below.
const ALREADY_DELETED_SESSION_MESSAGE =
  "The session was deleted by another process";

function isAlreadyDeletedSessionError(
  error: unknown,
  userDid: string,
): boolean {
  return (
    error instanceof TokenRefreshError &&
    error.sub === userDid &&
    error.message.includes(ALREADY_DELETED_SESSION_MESSAGE)
  );
}

export const POST: APIRoute = async ({ redirect, session, request }) => {
  const { did: userDid } = await readSessionGrant(session);
  if (!session || !userDid) {
    console.error("User is not logged in but logout was attempted.");
    return redirect(redirectAfterLogout);
  }

  // Check if a custom redirect was passed in the form data
  const body = await request.formData();
  const redirectValue = body.get("redirect");
  const customRedirect =
    typeof redirectValue === "string" ? redirectValue : undefined;
  const referer = request.headers.get("referer");
  const redirectTo = await getRedirectUrl({
    redirectToBase: customRedirect ?? redirectAfterLogout ?? "/",
    did: userDid,
    referer: referer ?? "",
  });

  await clearSessionGrant(session);

  try {
    const oauthClient = await getOAuthClient();
    const loggedInClient = await oauthClient.restore(userDid);
    await loggedInClient.signOut();
  } catch (error) {
    if (!isAlreadyDeletedSessionError(error, userDid)) {
      console.warn(
        "[authproto] failed to revoke OAuth session during logout",
        error,
      );
    }
  }

  return redirect(redirectTo);
};
