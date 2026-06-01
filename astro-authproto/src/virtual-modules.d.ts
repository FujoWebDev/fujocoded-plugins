// Type declarations for Authproto's virtual modules. These are the
// consumer-facing declarations: this file is injected into apps via
// `injectTypes` (see `astro:config:done` in `index.ts`) AND referenced by
// `config-module.d.ts` so the package's own source typechecks against the
// same source of truth.
declare module "fujocoded:authproto/config" {
  /**
   * The display name Authproto puts in OAuth client metadata.
   */
  export const applicationName: string;
  /**
   * The public site URL Authproto uses to build OAuth callback URLs.
   */
  export const applicationDomain: string;
  /**
   * The handle prefilled by `<Login />` in dev mode. Use this in custom forms
   * when you want the same local-dev helper.
   */
  export const defaultDevUser: string | null;
  /**
   * The public domain used when the app runs behind a proxy or tunnel.
   */
  export const externalDomain: string | undefined;
  /**
   * Authproto's configured session storage, or `null` when storage comes from
   * another generated module.
   */
  export const storage: import("unstorage").Storage | null;
  /**
   * Every scope this app is allowed to request. Custom forms can render this
   * list directly so they stay matched to `authProto({ scopes })`.
   */
  export const scopes: import("@fujocoded/authproto").OAuthScope[];
  /**
   * Scopes Authproto requests when a form does not ask for anything specific.
   * Defaults to all configured `scopes`.
   */
  export const defaultScopes: import("@fujocoded/authproto").OAuthScope[];
  /**
   * The configured storage driver name.
   */
  export const driverName: string;
  /**
   * The default path or URL Authproto sends users to after login.
   */
  export const redirectAfterLogin: string;
  /**
   * The default path or URL Authproto sends users to after logout.
   */
  export const redirectAfterLogout: string;
  /**
   * The domain Authproto uses for OAuth client metadata.
   */
  export const clientMetadataDomain: string;
  /**
   * Whether Astro is running in development mode.
   */
  export const isDev: boolean;
  /**
   * Whether the dev server was configured with `server.host`.
   */
  export const isDevServerHostSet: boolean;
}

declare module "fujocoded:authproto/hooks" {
  /**
   * The `resolveScopes` export of your configured `resolveScopesEntrypoint`, or
   * `null` when you did not configure one.
   */
  export const resolveScopes:
    | null
    | import("@fujocoded/authproto").ResolveScopesHook;
}

declare module "fujocoded:authproto/stores" {
  export {
    StateStore,
    SessionStore,
  } from "@fujocoded/authproto/stores/unstorage";
}
