> TODO: should call out somewhere VERY prominent that people should never set "fs" as a
> driver and commit the resulting folder to git: that's your actual account keys and it'll
> make it possible for people to login to your account (at least until they expire).
> Could consider adding a big warning in the terminal when people do (maybe file as an issue?)

Extension of the `login-logout` example.

If nobody is logged in, shows the Bluesky profile data for @fujocoded.
If somebody is logged in, shows the Bluesky profile data for the logged in user.

Calls [app.bsky.actor.getProfile](https://docs.bsky.app/docs/api/app-bsky-actor-get-profile) to retrieve user profile data. This does not require authentication.
