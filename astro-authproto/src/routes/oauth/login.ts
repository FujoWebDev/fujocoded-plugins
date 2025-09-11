import type { APIRoute } from "astro";
import { oauthClient } from "../../lib/auth.js";
import { scopes } from "fujocoded:authproto/config";

export const POST: APIRoute = async ({ redirect, request }) => {
  const body = await request.formData();
  const atprotoId = body.get("atproto-id")?.toString();
  const url = await oauthClient.authorize(atprotoId!, {
    scope: scopes.join(" "),
    // TODO: fix this state
    state: "dklasfjalskdf",
  });

  console.log(`Redirecting to PDS for Authorization`);
  return redirect(url.toString());
};
