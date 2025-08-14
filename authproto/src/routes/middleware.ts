import { didToHandle, oauthClient } from "../lib/auth.js";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async ({ locals, session }, next) => {
  const userDid = await session?.get("atproto-did");

  if (!session || !userDid) {
    locals.loggedInUser = null;
    return next();
  }

  try {
    // TODO: check how we can find out if the log in failed and then
    // delete the cookie.
    const loggedInClient = await oauthClient.restore(userDid);
    if (loggedInClient.did) {
      locals.loggedInUser = {
        did: loggedInClient.did,
        handle: await didToHandle(loggedInClient.did),
        fetchHandler: loggedInClient.fetchHandler.bind(loggedInClient),
      };
    }
  } catch (e) {
    await session.delete("atproto-did");
    locals.loggedInUser = null;
  }

  return next();
});
