import type { APIRoute } from "astro";
import { oauthClient } from "../../lib/auth.js";
import { getRedirectUrl } from "../../lib/redirects.js";
import { redirectAfterLogout } from "fujocoded:authproto/config";

export const POST: APIRoute = async ({ redirect, session, request }) => {
  const userDid = await session?.get("atproto-did");
  if (!session || !userDid) {
    console.error("User is not logged in but logout was attempted.");
    return redirect(redirectAfterLogout);
  }

  const loggedInClient = await oauthClient.restore(userDid);
  await loggedInClient.signOut();

  session.delete("atproto-did");

  // Check if a custom redirect was passed in the form data
  const body = await request.formData();
  const customRedirect = body.get("redirect")?.toString();
  const referer = request.headers.get("referer");
  const redirectTo = await getRedirectUrl({
    redirectToBase: customRedirect ?? redirectAfterLogout ?? "/",
    did: userDid,
    referer: referer ?? "",
  });

  return redirect(redirectTo);
};
