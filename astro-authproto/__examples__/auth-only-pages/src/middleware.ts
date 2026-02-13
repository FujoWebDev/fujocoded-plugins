import { defineMiddleware } from "astro:middleware";
import { AtpBaseClient } from "@atproto/api";

const MS_BOBA_DID = "did:plc:r2vpg2iszskbkegoldmqa322";

const FRIENDS_ONLY_PAGES = ["/secret"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Only pages in FRIENDS_ONLY_PAGES will be gated
  if (!FRIENDS_ONLY_PAGES.includes(context.url.pathname)) {
    return next();
  }
  const loggedInDid = context.locals.loggedInUser?.did;
  // Always gated when users not logged in (can be removed)
  if (!loggedInDid) {
    return context.redirect("/?reason=unauthorized");
  }

  const agent = new AtpBaseClient("https://public.api.bsky.app");
  const relationships = await agent.app.bsky.graph.getRelationships({
    actor: MS_BOBA_DID,
    others: [loggedInDid],
  });
  const usersRelationship = relationships.data.relationships.at(0);

  const self = MS_BOBA_DID == loggedInDid;
  // True if the current user follows target
  const follower =
    usersRelationship &&
    "followedBy" in usersRelationship &&
    Boolean(usersRelationship.followedBy);
  // True if target follows the current user
  const following =
    usersRelationship &&
    "following" in usersRelationship &&
    Boolean(usersRelationship.following);
  // True if this is a mutual relationship
  const mutuals = follower && following;

  // This is where we redirect. Change the condition according to which
  // relationships give access to the page.
  if (!self && !follower) {
    return context.rewrite(new URL("/unauthorized", context.url));
  }

  return next();
});
