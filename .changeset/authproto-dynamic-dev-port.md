---
"@fujocoded/authproto": patch
---

Use Astro's actual dev server port for the OAuth callback URL in development
instead of always assuming `4321`. If you run `astro dev --port 4322` (or set
`server.port` in your Astro config), Authproto now points OAuth at the right
local URL.
