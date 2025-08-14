import type { APIRoute } from "astro";
import { oauthClient } from "../../lib/auth.js";

export const POST: APIRoute = async ({ redirect, session }) => {
  const userDid = await session?.get("atproto-did");
  if (!session || !userDid) {
    console.error("User is not logged in but logout was attempted.");
    return redirect("/");
  }

  const loggedInClient = await oauthClient.restore(userDid);
  await loggedInClient.signOut();

  session.delete("atproto-did");

  return redirect("/");
};
