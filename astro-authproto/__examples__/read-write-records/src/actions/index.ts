import { TID } from "@atproto/common-web";
import { getPdsAgent } from "@fujocoded/authproto/helpers";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";

export const server = {
  addStatus: defineAction({
    accept: "form",
    input: z.object({
      status: z.string(),
    }),
    handler: async (input, context) => {
      const loggedInUser = context.locals.loggedInUser;
      
      // users who are not logged in shouldn't be able to post a record
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "You're not logged in!",
        });
      }

      // Since we need to write, the agent needs to the information
      // of the logged in user.
      // TODO: explain better
      const agent = await getPdsAgent({ loggedInUser }); // this is needed to make requests to atproto

        if (!agent) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Something went wrong when connecting to your PDS.",
          });
        }
  
      try {    
        const statusRecord = {
            status: input.status,
            createdAt: new Date().toISOString(),
        };
        
        // we'll construct a record and post it with the "createRecord()" method
        const result = await agent.com.atproto.repo.createRecord({
          repo: loggedInUser.did, // a repo will be a user's did or handle
          collection: "xyz.statuscity.status", // see NSID: https://atproto.com/specs/nsid
          rkey: TID.nextStr(), // we'll generate a record key using a timestamp function,
          record: statusRecord,
        });

        // this will return the data as a string
        return {recordAtUri: result.data.uri};
      } catch (error) {
        console.error(error);
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Something went wrong with posting your status to your PDS!",
        });
      }
    }
  }),
}