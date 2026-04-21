import type { APIRoute } from "astro";
import { clientMetadataDomain } from "fujocoded:authproto/config";
import { createClientMetadata } from "../lib/auth.js";

export const GET: APIRoute = async ({}) => {
  return new Response(
    JSON.stringify(createClientMetadata(clientMetadataDomain)),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
