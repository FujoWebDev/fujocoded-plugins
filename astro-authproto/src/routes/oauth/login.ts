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
  const atprotoIdValue = body.get("atproto-id");
  const atprotoId =
    typeof atprotoIdValue === "string" ? atprotoIdValue : undefined;
  const redirectValue = body.get("redirect");
  const customRedirect =
    typeof redirectValue === "string" ? redirectValue : undefined;

  // Get the referer to redirect back to the same page after login
  // if the developer asked us to do so
  const referer = request.headers.get("referer");

  // Build state that includes both CSRF protection and optional redirect
  const stateData = {
    csrf: randomBytes(16).toString("base64url"),
    ...(customRedirect && { redirect: customRedirect }),
    ...(referer && !customRedirect && { referer }),
  };

  if (!atprotoId) {
    session?.set(AUTHPROTO_ERROR_CODE, "MISSING_FIELD");
    session?.set(
      AUTHPROTO_ERROR_DESCRIPTION,
      'Missing required "atproto-id" field in login form data',
    );
    return redirect(stateData.referer || "/");
  }

  try {
    const url = await oauthClient.authorize(atprotoId, {
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
