import type { APIContext } from "astro";
import { AtpBaseClient } from "@atproto/api";
import { DidResolver } from "@atproto/identity"; // this is already included with @fujocoded/authproto!

export async function getAgent(locals: APIContext["locals"]) {
  const loggedInUser = locals.loggedInUser;
  try {
    const agent = new AtpBaseClient(loggedInUser?.fetchHandler!);
    return agent;
  } catch (error) {
    return;
  }
}

// this is good if you want to resolve a did into a user-friendly handle
const RESOLVER = new DidResolver({});
export async function didToHandle(did: string) {
  try {
    const atProtoData = await RESOLVER.resolveAtprotoData(did);
    return atProtoData.handle;
  } catch (error) {
    return "Invalid handle";
  }
}