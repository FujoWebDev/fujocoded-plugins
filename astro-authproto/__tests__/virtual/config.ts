// Mpcks the `fujocoded:authproto/config` virtual module via vitest.config.ts.
// Mirrors what the Astro integration emits at build time so src/ can read its
// configuration through the same import shape it uses in production.
export const applicationName = "AuthProto Test App";
export const applicationDomain = "http://127.0.0.1:4321";
export const defaultDevUser = null;
export const externalDomain = undefined;
export const storage = null;
export const scopes = ["atproto", "transition:generic", "transition:email"];
export const defaultScopes = ["atproto", "transition:generic"];
export const driverName = "memory";
export const redirectAfterLogin = "/";
export const redirectAfterLogout = "/";
export const clientMetadataDomain = "http://127.0.0.1:4321";
export const isDev = true;
export const isDevServerHostSet = true;
