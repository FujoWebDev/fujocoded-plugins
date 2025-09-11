import type { APIRoute } from "astro";
import { oauthClient } from "../../lib/auth.js";

export const GET: APIRoute = async ({ params, request, redirect, session }) => {
  const requestUrl = new URL(request.url);
  const { session: oauthSession } = await oauthClient.callback(
    requestUrl.searchParams
  );

  session?.set("atproto-did", oauthSession.did);

  return redirect(`/`);
};
