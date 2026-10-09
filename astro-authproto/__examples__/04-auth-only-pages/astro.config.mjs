// @ts-check
import { defineConfig } from "astro/config";
import authProto from "@fujocoded/authproto";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  session: {
    driver: "fs",
  },
  integrations: [
    authProto({
      applicationName: "Authproto test",
      applicationDomain: "fujocoded.com",
      defaultDevUser: "bobatan.fujocoded.com",
      driver: { name: "memory" },
      scopes: {
        // Don't need scopes cause we only need
        // access to the logged in identity
      },
    }),
  ],
});
