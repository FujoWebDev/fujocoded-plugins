// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import authProto, { account, repo, rpc } from "@fujocoded/authproto";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  session: {
    driver: "fs",
  },
  security: {
    allowedDomains: [{ hostname: "fujocoded.com", protocol: "https" }],
  },
  integrations: [
    authProto({
      applicationName: "Custom Scopes Demo",
      applicationDomain: "https://fujocoded.com",
      defaultDevUser: "bobatan.fujocoded.com",
      driver: {
        name: "fs",
        options: {
          base: "./.astro/authproto",
        },
      },
      // Every scope this site may ever request, built with the granular
      // permission helpers. The login route ignores anything not listed here,
      // even if a form asks for it.
      scopes: [
        // Read the user's email address and confirmation status
        account("email"),
        // Create, update, and delete this site's guestbook entries
        repo("com.fujocoded.guestbook", {
          action: ["create", "update", "delete"],
        }),
        // Send Bluesky direct messages on the user's behalf
        rpc("chat.bsky.convo.sendMessage", {
          aud: "did:web:api.bsky.chat#bsky_chat",
        }),
      ],
      // Scopes the built-in <Login /> asks for when a form does not override
      // them. Keep this as a subset of `scopes` above.
      defaultScopes: [
        repo("com.fujocoded.guestbook", {
          action: ["create", "update", "delete"],
        }),
      ],
    }),
  ],
});
