import { didToHandle, getOAuthClient } from "../lib/auth.js";
import { type MiddlewareHandler } from "astro";
import {
  clearSessionGrant,
  readAndClearAuthprotoError,
  readSessionGrant,
} from "../lib/session-state.js";

export const onRequest: MiddlewareHandler = async (
  { locals, session },
  next,
) => {
  const grant = await readSessionGrant(session);
  const error = await readAndClearAuthprotoError(session);
  locals.authproto = error
    ? {
        errorCode: error.code,
        errorDescription: error.description,
        errorUri: error.uri,
      }
    : null;
  locals.loggedInUser = null;
  locals.loggedInClient = null;

  if (!session || !grant.did) {
    return next();
  }

  try {
    const oauthClient = await getOAuthClient();
    const loggedInClient = await oauthClient.restore(grant.did);
    if (loggedInClient.did) {
      locals.loggedInUser = {
        did: loggedInClient.did,
        handle: await didToHandle(loggedInClient.did),
        scopes: grant.scopes,
        fetchHandler: loggedInClient.fetchHandler.bind(loggedInClient),
      };
      locals.loggedInClient = loggedInClient;
    }
  } catch {
    await clearSessionGrant(session);
  }

  return next();
};
