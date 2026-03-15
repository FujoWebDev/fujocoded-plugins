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
      applicationName: "Custom Scopes Demo",
      applicationDomain: "fujocoded.com",
      defaultDevUser: "bobatan.fujocoded.com",
      // We must specify all the scopes that this website may ever
      // request, even if we'll override them in single requests.
      scopes: {
        email: true,
        genericData: true,
        directMessages: true,
      },
      // The default set of scopes this app will request
      defaultScopes: {
        genericData: true,
      },
    }),
  ],
});
