// @ts-check
import { defineConfig } from "astro/config";
import authProto from "@fujocoded/authproto";

// https://astro.build/config
export default defineConfig({
  output: "server",
  session: {
    driver: "memory",
  },
  integrations: [
    authProto({
      applicationName: "Authproto test",
      applicationDomain: "fujocoded.com",
      defaultDevUser: "essentialrandom.bsky.social",
      scopes: {
        genericData: true, // this is needed to create, update, or delete records from a PDS
      },
    }),
  ],
});
