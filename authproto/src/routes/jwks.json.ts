import type { APIRoute } from "astro";
import { oauthClient } from "../lib/auth.js";

export const GET: APIRoute = async ({}) => {
  return new Response(JSON.stringify(oauthClient.jwks), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
