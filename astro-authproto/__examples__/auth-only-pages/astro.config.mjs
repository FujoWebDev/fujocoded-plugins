// @ts-check
import { defineConfig } from "astro/config";
import authProto from "@fujocoded/authproto";

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
    }),
  ],
});
