import { AtpBaseClient } from "@atproto/api";
import { IdResolver } from "@atproto/identity";


const IDENTITY_RESOLVER = new IdResolver({});
export const getDid = async ({ didOrHandle }: { didOrHandle: string }) => {
  if (didOrHandle.startsWith("did:")) {
    return didOrHandle;
  }
  return await IDENTITY_RESOLVER.handle.resolve(didOrHandle);
};

const getPdsUrl = async ({ didOrHandle }: { didOrHandle: string }) => {
  const did = await getDid({ didOrHandle });
  if (!did) {
    throw new Error(`Did not resolve to a valid DID: ${didOrHandle}`);
  }
  const atprotoData = await IDENTITY_RESOLVER.did.resolveAtprotoData(did);
  return atprotoData.pds;
};


/**
 * Sends requests through the PDS of the logged in user. This means they will
 * have authentication status.
 */
export async function getLoggedInAgent(loggedInUser: NonNullable<App.Locals["loggedInUser"]>) {
  try {
    const agent = new AtpBaseClient(loggedInUser.fetchHandler);
    return agent;
  } catch (error) {
    return null;
  }
}

/**
 * Sends requests directly to a user's PDS. Useful to retrieve records directly
 * from the sources.
 *
 * To create, edit or delete records make sure to pass in the full
 * "loggedInUser" rather than just its did, so authentication details are passed
 * through.
 */
export async function getPdsAgent(pdsOwner: { didOrHandle: string } | { loggedInUser: NonNullable<App.Locals["loggedInUser"]> }) {
  if ("loggedInUser" in pdsOwner) {
    return getLoggedInAgent(pdsOwner.loggedInUser)
  }
  try {
    const destination = await getPdsUrl({ didOrHandle: pdsOwner.didOrHandle });
    if (!destination) {
      return null;
    }
    const agent = new AtpBaseClient(destination);
    return agent;
  } catch (error) {
    return null;
  }
}

/**
 * This agent sends requests to the BlueSky appview. If a loggedInUser is
 * present then it will send them through the users' PDS first to validate
 * authentication status.
 */
export async function getBlueskyAgent(user?: { loggedInUser: NonNullable<App.Locals["loggedInUser"]> }) {
  try {
    const agent = new AtpBaseClient(user ? user.loggedInUser.fetchHandler : "https://public.api.bsky.app/");
    return agent;
  } catch (error) {
    return null;
  }
}