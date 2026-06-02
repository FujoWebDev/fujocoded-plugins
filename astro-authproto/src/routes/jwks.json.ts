import type { APIRoute } from "astro";
import { getOAuthClient } from "../lib/auth.js";

export const GET: APIRoute = async () => {
  const oauthClient = await getOAuthClient();
  return new Response(JSON.stringify(oauthClient.jwks), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
