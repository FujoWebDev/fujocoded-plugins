import type { APIRoute } from "astro";
import { oauthClient } from "../../lib/auth.js";

export const POST: APIRoute = async ({ redirect, request }) => {
  const body = await request.formData();
  const atprotoId = body.get("atproto-id")?.toString();
  const url = await oauthClient.authorize(atprotoId!, {
    scope: "atproto transition:generic",
    // TODO: fix this state
    state: "dklasfjalskdf",
  });

  console.log(`Redirecting to PDS for Authorization`);
  return redirect(url.toString());
};
