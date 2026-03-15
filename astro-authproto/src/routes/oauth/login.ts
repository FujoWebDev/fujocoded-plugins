import type { APIRoute } from "astro";
import { extractAuthError, oauthClient } from "../../lib/auth.js";
import { scopes, defaultScopes } from "fujocoded:authproto/config";
import { resolveScopes } from "fujocoded:authproto/hooks";
import { randomBytes } from "node:crypto";
import {
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_ERROR_DESCRIPTION,
} from "../../../src/routes/middleware.ts";

const getScopes = async (requestedScopes: string[], atprotoId?: string) => {
  let finalScopes: string[];
  if (requestedScopes.length > 0) {
    // Per-request scopes provided: validate they're a subset of configured max scopes
    finalScopes = requestedScopes.filter((s) => scopes.includes(s));
  } else {
    // No per-request scopes: use defaultScopes from config
    finalScopes = [...defaultScopes];
  }

  // Ensure "atproto" is always included
  if (!finalScopes.includes("atproto")) {
    finalScopes.unshift("atproto");
  }

  // Call resolveScopes hook if configured. This lets us add scopes
  // based on user rather than on "form".
  if (resolveScopes && atprotoId) {
    finalScopes = await resolveScopes(atprotoId, finalScopes);
  }

  return finalScopes;
};

export const POST: APIRoute = async ({ redirect, request, session }) => {
  const body = await request.formData();
  const atprotoId = body.get("atproto-id")?.toString();
  const customRedirect = body.get("redirect")?.toString();
  const requestedScopes = body.getAll("scope").map((s) => s.toString());

  // Get the referer to redirect back to the same page after login
  // if the developer asked us to do so
  const referer = request.headers.get("referer");

  const finalScopes = await getScopes(requestedScopes, atprotoId);

  // Build state that includes both CSRF protection and optional redirect
  const stateData = {
    csrf: randomBytes(16).toString("base64url"),
    scopes: finalScopes,
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
      scope: finalScopes.join(" "),
      // This random value protects against CSRF (Cross-Site Request
      // Forgery) attacks. We send it along our authorization request, and the OAuth
      // provider will send it back with the authentication response. By verifying
      // it matches what we sent, we can be sure the callback is in response to
      // OUR authorization request, not someone else's.
      // We also encode the desired redirect URL and scopes if provided.
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
