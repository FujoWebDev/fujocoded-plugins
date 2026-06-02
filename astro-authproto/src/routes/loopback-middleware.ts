import { type MiddlewareHandler } from "astro";

const isDev = process.env.NODE_ENV === "development";

/**
 * Sends `localhost` visitors to `127.0.0.1` during local development.
 *
 * In dev it's required by ATproto OAuth that we build all OAuth callback URLs
 * against `127.0.0.1`. Even if the app is bound to `127.0.0.1`, however, it's
 * still possible to open the dev server at `localhost`. This would not match
 * those URLs and could not log in, so we redirect to the same address on
 * `127.0.0.1` first. Outside dev, or for any other hostname, the request passes
 * through unchanged.
 */
export const onRequest: MiddlewareHandler = (context, next) => {
  if (isDev && context.url.hostname === "localhost") {
    const url = new URL(context.url);
    url.hostname = "127.0.0.1";
    return context.redirect(url.toString(), 307);
  }
  return next();
};
