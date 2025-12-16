import type { APIRoute } from "astro";
import { extractAuthError, oauthClient } from "../../lib/auth.js";
import { scopes } from "fujocoded:authproto/config";
import { randomBytes } from "node:crypto";
import {
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_ERROR_DESCRIPTION,
} from "../../../src/routes/middleware.ts";

export const POST: APIRoute = async ({ redirect, request, session }) => {
  const body = await request.formData();
  const atprotoId = body.get("atproto-id")?.toString();
  const customRedirect = body.get("redirect")?.toString();

  // Get the referer to redirect back to the same page after login
  // if the developer asked us to do so
  const referer = request.headers.get("referer");

  // Build state that includes both CSRF protection and optional redirect
  const stateData = {
    csrf: randomBytes(16).toString("base64url"),
    ...(customRedirect && { redirect: customRedirect }),
    ...(referer && !customRedirect && { referer }),
  };

  try {
    const url = await oauthClient.authorize(atprotoId!, {
      scope: scopes.join(" "),
      // This random value protects against CSRF (Cross-Site Request
      // Forgery) attacks. We send it along our authorization request, and the OAuth
      // provider will send it back with the authentication response. By verifying
      // it matches what we sent, we can be sure the callback is in response to
      // OUR authorization request, not someone else's.
      // We also encode the desired redirect URL if provided.
      state: Buffer.from(JSON.stringify(stateData)).toString("base64url"),
    });

    return redirect(url.toString());
  } catch (e) {
    const authError = extractAuthError(e);
    session?.set(AUTHPROTO_ERROR_CODE, authError.code);
    session?.set(AUTHPROTO_ERROR_DESCRIPTION, authError.description);

    return redirect(stateData.referer || "/");
  }
};
