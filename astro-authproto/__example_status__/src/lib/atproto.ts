import type { APIContext } from "astro";
import { AtpBaseClient } from "@atproto/api";
import { DidResolver } from "@atproto/identity"; // this is already included with @fujocoded/authproto!

export async function getLoggedInAgent(loggedInUser: NonNullable<App.Locals["loggedInUser"]>) {
  try {
    const agent = new AtpBaseClient(loggedInUser.fetchHandler);
    return agent;
  } catch (error) {
    return null;
  }
}

export async function getPublicAgent() {
  try {
    const agent = new AtpBaseClient("https://public.api.bsky.app/");
    return agent;
  } catch (error) {
    return null;
  }
}

// TODO: explain this better
// TODO: Do we really want this here? are we using it anywhere?
// this is good if you want to resolve a did into a user-friendly handle
export async function didToHandle(did: string) {
  try {
    const didResolver = new DidResolver({});
    const atProtoData = await didResolver.resolveAtprotoData(did);
    return atProtoData.handle;
  } catch (error) {
    return "Invalid handle";
  }
}