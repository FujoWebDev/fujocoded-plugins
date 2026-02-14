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
  integrations: [
    authProto({
      applicationName: "Login Logout",
      applicationDomain: "localhost:4321",
      driver: {
        name: "fs",
        options: {
          base: "./tmp",
        },
      },
    }),
  ],
});
