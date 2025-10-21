// @ts-check
import { defineConfig } from "astro/config";
import authProto, {
  LOGGED_IN_DID_TEMPLATE,
  REDIRECT_TO_REFERER_TEMPLATE,
} from "@fujocoded/authproto";

// https://astro.build/config
export default defineConfig({
  output: "server",
  session: {
    driver: "fs",
  },
  integrations: [
    authProto({
      applicationName: "Authproto test",
      applicationDomain: "fujocoded.com",
      defaultDevUser: "essentialrandom.bsky.social",
      scopes: {
        email: true,
        directMessages: true,
        additionalScopes: ["transition:generic"],
      },
      redirects: {
        // You can use the following template variables in the redirect URLs:
        //
        // {referer} => The URL of the page the user logged in/out from
        // {loggedInUser.did} => The logged in user's DID
        // {loggedInUser.handle} => The logged in user's handle
        //
        // They also come nicely packaged as exported variables.
        afterLogin: `/hello?did=${LOGGED_IN_DID_TEMPLATE}`,
        afterLogout: `${REDIRECT_TO_REFERER_TEMPLATE}?reason=logged-out`,
        // If you don't need to use these, you can simply use a string instead.
        // afterLogout: "/bye",
      },
    }),
  ],
});
