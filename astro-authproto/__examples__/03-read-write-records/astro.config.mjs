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
    driver: "memory",
  },
  integrations: [
    authProto({
      applicationName: "Authproto test",
      applicationDomain: "fujocoded.com",
      defaultDevUser: "bobatan.fujoweb.dev",
      driver: { name: "memory" },
      scopes: {
        genericData: true, // this is needed to create, update, or delete records from a PDS
      },
    }),
  ],
});
