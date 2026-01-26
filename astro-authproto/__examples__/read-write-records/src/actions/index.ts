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

      // getPdsAgent is an authorized agent that talks with ATProto
      // using the PDS for the `loggedInUser` provided by @fujocoded/authproto
      const agent = await getPdsAgent({ loggedInUser });

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
  deleteStatus: defineAction({
    input: z.object({
      status_id: z.string(),
    }),
    handler: async (input, context) => {
      const loggedInUser = context.locals.loggedInUser;
      
      // users who are not logged in shouldn't be able to delete a record
      if (!loggedInUser) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "You're not logged in!",
        });
      }

      // getPdsAgent is an authorized agent that talks with ATProto
      // using the PDS for the `loggedInUser` provided by @fujocoded/authproto
      const agent = await getPdsAgent({ loggedInUser });

        if (!agent) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Something went wrong when connecting to your PDS.",
          });
        }
  
      try {    
        
        // we'll delete the passed record 
        const result = await agent.com.atproto.repo.deleteRecord({
          repo: loggedInUser.did, // a repo will be a user's did or handle
          collection: "xyz.statuscity.status", // see NSID: https://atproto.com/specs/nsid
          rkey: input.status_id, // we'll delete the status using the id that was passed
        });

        // this will return the data as a string
        return {response: result.data.commit };
      } catch (error) {
        console.error(error);
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Something went wrong with deleting your status from your PDS!",
        });
      }
    },
  }),
}
