// @ts-check
import { defineConfig } from "astro/config";
import authProto from "@fujocoded/authproto";
import db from "@astrojs/db";

// https://astro.build/config
export default defineConfig({
  output: "server",
  session: {
    driver: "fs",
  },
  integrations: [
    authProto({
      // driver: {
      //   name: "astro:db",
      // },
      applicationName: "Authproto test",
      applicationDomain: "fujocoded.com",
      defaultDevUser: "essentialrandom.bsky.social",
      scopes: {
        genericData: true, // this is needed to create, update, or delete records from a PDS
      },
    }),
    // db(),
  ],
});
