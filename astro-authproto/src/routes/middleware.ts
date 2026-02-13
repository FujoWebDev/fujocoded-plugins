import { didToHandle, oauthClient } from "../lib/auth.js";
import { type MiddlewareHandler } from "astro";

export const AUTHPROTO_ERROR_CODE = "authproto-error-code";
export const AUTHPROTO_ERROR_DESCRIPTION = "authproto-error-description";

export const onRequest: MiddlewareHandler = async (
  { locals, session },
  next,
) => {
  const userDid = await session?.get("atproto-did");
  const errorCode = await session?.get(AUTHPROTO_ERROR_CODE);
  const errorDescription = await session?.get(AUTHPROTO_ERROR_DESCRIPTION);
  if (errorCode || errorDescription) {
    locals.authproto = {
      // TODO: add input handler
      errorCode,
      errorDescription,
    };
    await session?.delete(AUTHPROTO_ERROR_CODE);
    await session?.delete(AUTHPROTO_ERROR_DESCRIPTION);
  }

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
};
