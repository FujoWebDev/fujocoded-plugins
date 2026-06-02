import type { APIContext } from "astro";
import {
  extractAuthError,
  getOAuthClient,
  resolveAtprotoIdentity,
} from "../../lib/auth.js";
import {
  defaultScopes,
  scopes,
  isDev,
  isDevServerHostSet,
} from "fujocoded:authproto/config";
import { resolveScopes } from "fujocoded:authproto/hooks";
import {
  persistAuthprotoError,
  type AuthprotoSession,
} from "../../lib/session-state.js";
import { resolveServerLoginScopes } from "../../lib/scopes.js";
import { encodeOAuthState, type OAuthState } from "../../lib/oauth-state.js";

// Restrict the type of the routes to just what we need to make them easier to test
type LoginRouteContext = Pick<APIContext, "redirect" | "request"> & {
  session?: AuthprotoSession;
};

const DEV_HOST_WARNING = [
  "",
  "  ATproto OAuth needs your dev server to bind to 127.0.0.1, but it",
  "  isn't. Login will fail with a redirect URI error until you fix this.",
  "",
  "  Pick one:",
  "    • Run:  astro dev --host",
  "    • Or set in astro.config.mjs:",
  "        server: { host: true }",
  "",
].join("\n");

export const POST = async ({
  redirect,
  request,
  session,
}: LoginRouteContext) => {
  if (isDev && !isDevServerHostSet) {
    console.error(DEV_HOST_WARNING);
  }

  const body = await request.formData();
  const atprotoIdValue = body.get("atproto-id");
  const atprotoId =
    typeof atprotoIdValue === "string" ? atprotoIdValue : undefined;
  const redirectValue = body.get("redirect");
  const customRedirect =
    typeof redirectValue === "string" ? redirectValue : undefined;
  const requestedScopes = body
    .getAll("scope")
    .filter((scope): scope is string => typeof scope === "string");

  // Keep the current page as the fallback redirect. A custom `redirect` field
  // still wins when a form sends one.
  const referer = request.headers.get("referer");
  const errorRedirect = referer || "/";

  if (!atprotoId) {
    await persistAuthprotoError(session, {
      code: "MISSING_FIELD",
      description: 'Missing required "atproto-id" field in login form data',
    });
    return redirect(errorRedirect);
  }

  try {
    const finalScopes = await resolveServerLoginScopes({
      requestedScopes,
      configuredScopes: scopes,
      defaultScopes,
      atprotoId,
      resolveScopes,
      resolveIdentity: resolveAtprotoIdentity,
    });
    const oauthClient = await getOAuthClient();
    const url = await oauthClient.authorize(atprotoId, {
      scope: finalScopes.join(" "),
      // The encoded state ties this callback to the login that started it.
      // It also carries the redirect and selected scopes through the provider.
      state: encodeOAuthState({
        scopes: finalScopes,
        ...(customRedirect && { redirect: customRedirect }),
        ...(referer && !customRedirect && { referer }),
      } satisfies OAuthState),
    });

    return redirect(url.toString());
  } catch (e) {
    const authError = extractAuthError(e);
    await persistAuthprotoError(session, {
      code: authError.code,
      description: authError.description,
    });

    return redirect(errorRedirect);
  }
};
