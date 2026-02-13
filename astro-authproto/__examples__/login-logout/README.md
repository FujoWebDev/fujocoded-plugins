Very simple implementation of @fujocoded/authproto that shows off login/logout
functionality.

> TODO: we should call out people need the --host in their command or `host:
true` in their config. This is likely to get people very confused, cause
> they'll miss it in `package.json` then wonder why their thing isn't working.
> I'd say we move it to `astro.config.mjs` and call out there that it's
> necessary for the login redirect to work (ATproto's rules, not mine)

> LATER ADDITION: Just discovered I had put a warning for this 👇! Still, we
> should call it out explicitly somewhere, and maybe message this better.
> Complication: It's `astro dev --host` if written in `package.json`;
> `npm run dev -- --host` if added when running from command line;
> `{server: { host: true } }` when set in `astro.config.mjs`.
> I don't know how to avoid confusing people with options, but if we had
> it as a README section it could link to a longer explanation.
>
> 17:02:04 [ERROR] [fujocoded:authproto] ATproto requires
> the local redirect URL to be 127.0.0.1 (not localhost) but your site is not
> running on a network address. Run `astro dev --host` to fix this.

Nothing super special, see [existing @fujocoded/authproto
README](../../README.md).
