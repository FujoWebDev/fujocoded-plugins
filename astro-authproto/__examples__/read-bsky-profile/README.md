Extension of the `login-logout` example.

If nobody is logged in, shows the Bluesky profile data for @fujocoded.
If somebody is logged in, shows the Bluesky profile data for the logged in user. 

Calls [app.bsky.actor.getProfile](https://docs.bsky.app/docs/api/app-bsky-actor-get-profile) to retrieve user profile data. This does not require authentication.
