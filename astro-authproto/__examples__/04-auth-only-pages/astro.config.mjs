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
      defaultDevUser: "bobatan.fujocoded.com",
      scopes: {
        // Don't need scopes cause we only need
        // access to the logged in identity
      },
    }),
  ],
});
