import type { APIRoute } from "astro";
import { applicationDomain } from "fujocoded:authproto/config";
import { createClientMetadata } from "../lib/auth.js";

export const GET: APIRoute = async ({}) => {
  return new Response(
    JSON.stringify(createClientMetadata(applicationDomain)),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};
