import { defineMiddleware } from "astro:middleware";
import { AtpBaseClient } from "@atproto/api";

const MS_BOBA_DID = "did:plc:r2vpg2iszskbkegoldmqa322";
const HAETAE_DID = "did:plc:dg2qmmjic7mmecrbvpuhtvh6";
const FUJOCODED_DID = "did:plc:737bslnnf7vyaktosjlrshmd";

const FRIENDS_ONLY_PAGES = ["/secret"];

export const onRequest = defineMiddleware(async (context, next) => {
    if (!FRIENDS_ONLY_PAGES.includes(context.url.pathname)) {
        return next();
    }
    const loggedInDid = context.locals.loggedInUser?.did;
    if (!loggedInDid) {
        return context.redirect("/?reason=unauthorized");
    }

    const agent = new AtpBaseClient("https://public.api.bsky.app");
    const relationships = await agent.app.bsky.graph.getRelationships({ actor: FUJOCODED_DID, others: [loggedInDid] });
    const usersRelationship = relationships.data.relationships.at(0);

    // True if the current user follows you 
    const follower = usersRelationship && "followedBy" in usersRelationship && Boolean(usersRelationship.followedBy);
    // True if you follow the current user
    const following = usersRelationship && "following" in usersRelationship && Boolean(usersRelationship.following);
    // True if this is a mutual relationship
    const mutuals = follower && following;

    if (!following) {
        return context.rewrite(new URL("/unauthorized", context.url));
    }

    return next();
});