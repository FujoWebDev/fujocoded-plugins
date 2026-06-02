import type { APIContext } from "astro";
import { extractAuthError, getOAuthClient } from "../../lib/auth.js";
import { getRedirectUrl } from "../../lib/redirects.js";
import { redirectAfterLogin } from "fujocoded:authproto/config";
import { decodeOAuthState } from "../../lib/oauth-state.js";
import {
  AuthprotoSession,
  persistAuthprotoError,
  persistLoginGrant,
} from "../../lib/session-state.js";
import { type OAuthSession } from "@atproto/oauth-client-node";

type CallbackError = {
  code: string;
  description?: string;
  uri?: string;
};

// Restrict the type of the routes to just what we need to make them easier to test
type CallbackRouteContext = Pick<APIContext, "redirect" | "request"> & {
  session?: AuthprotoSession;
};

const readCallbackErrorParams = (
  params: URLSearchParams,
): CallbackError | null => {
  const code = params.get("error");
  const description = params.get("error_description") ?? undefined;
  const uri = params.get("error_uri") ?? undefined;
  if (!code && !description && !uri) {
    return null;
  }
  const fallbackDescription = description ?? code;
  return {
    code: code ?? "UNKNOWN",
    ...(fallbackDescription !== null && { description: fallbackDescription }),
    ...(uri !== null && { uri }),
  };
};

const tryOAuthCallback = async (
  params: URLSearchParams,
): Promise<
  { session: OAuthSession; state: string | null } | { error: CallbackError }
> => {
  try {
    const oauthClient = await getOAuthClient();
    const { session, state } = await oauthClient.callback(params);
    return { session, state };
  } catch (e) {
    const authError = extractAuthError(e);
    return {
      error: { code: authError.code, description: authError.description },
    };
  }
};

export const GET = async ({
  request,
  redirect,
  session,
}: CallbackRouteContext) => {
  const requestUrl = new URL(request.url);

  const searchParamsError = readCallbackErrorParams(requestUrl.searchParams);

  // A provider-side error means there's nothing trustworthy to exchange —
  // record the error and bail before we even talk to the OAuth client.
  if (searchParamsError) {
    await persistAuthprotoError(session, searchParamsError);
    return redirect("/");
  }

  if (!requestUrl.searchParams.has("code")) {
    await persistAuthprotoError(session, {
      code: "INVALID_CALLBACK",
      description: 'Missing required "code" parameter in OAuth callback',
    });
    return redirect("/");
  }

  const callbackResult = await tryOAuthCallback(requestUrl.searchParams);
  const oauthFailed = "error" in callbackResult;
  const oauthSession = oauthFailed ? null : callbackResult.session;
  const oauthState = oauthFailed ? null : callbackResult.state;

  // A provider-side error already returned above, so the only failure that can
  // reach here is the OAuth client failing to exchange the code.
  if (oauthFailed) {
    await persistAuthprotoError(session, callbackResult.error);
  }

  // Do not decode `requestUrl.searchParams.get("state")` here. It is not the
  // app state we passed to `authorize()` during login: the OAuth client sets
  // that callback value and uses it to validate the login attempt. After
  // validation, `oauthClient.callback()` returns our app state and carries our
  // redirect and granted scopes. If it cannot be decoded, we can still finish
  // login and use the default redirect.
  const stateData = decodeOAuthState(oauthState);
  const { redirect: customRedirect, referer, scopes } = stateData;

  if (oauthSession) {
    await persistLoginGrant(session, {
      did: oauthSession.did,
      scopes,
    });
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
