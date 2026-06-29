import type { BuiltinDriverOptions, BuiltinDriverName } from "unstorage";

type AstroDriverOption = { name: "astro:db"; options?: never };
type OptionsType<T extends BuiltinDriverName = BuiltinDriverName> =
  T extends keyof BuiltinDriverOptions
    ? { name: T; options: BuiltinDriverOptions[T] }
    : { name: T; options?: never };
export type AllDriverOptions =
  | {
      [K in BuiltinDriverName]: OptionsType<K>;
    }[BuiltinDriverName]
  | { name: "astro:db"; options?: never };

export type OAuthScope =
  /**
   * The generic scope for ATproto authentication. All apps must have this scope.
   */
  | "atproto"
  /**
   * Allows access to a user's email address and confirmation status.
   */
  | "transition:email"
  /**
   * Allows write/read access to a user's chat.bsky data.
   */
  | "transition:chat.bsky"
  /**
   * Allows write access to a user's generic data.
   */
  | "transition:generic"
  /**
   * Additional scopes not covered by the others.
   */
  | (string & {});

export type ScopesOption =
  | OAuthScope[]
  | {
      /**
       * Ask for access to the user's email address and confirmation status.
       */
      email?: boolean;
      /**
       * Ask to read and write the user's non-DM ATproto records.
       */
      genericData?: boolean;
      /**
       * Ask to read and write Bluesky direct messages. Requires
       * `genericData: true`.
       */
      directMessages?: boolean;
      /**
       * Extra OAuth scope strings for services not covered by the named
       * options.
       */
      additionalScopes?: OAuthScope[];
    };

export interface ConfigOptions {
  applicationName: string;
  applicationDomain: string;
  defaultDevUser?: string;
  externalDomain?: string;
  driver?: AllDriverOptions | AstroDriverOption;
  /**
   * Every OAuth scope this app may request.
   *
   * Authproto always includes `"atproto"`. Custom login forms and
   * `resolveScopesEntrypoint` cannot grant scopes you did not list here.
   * Omit this to request only `"atproto"`.
   */
  scopes?: ScopesOption;
  /**
   * Scopes Authproto requests when no per-request scopes come in.
   *
   * This is used when `<Login />` has no `scopes` or `extendDefaultScopes`,
   * and when a custom form sends no `scope` fields. Defaults to all configured
   * `scopes`.
   */
  defaultScopes?: ScopesOption;
  /**
   * Lets you change which scopes a login asks for, per account.
   *
   * Point this at a module that exports a `resolveScopes(input)`
   * function. Authproto calls it after picking scopes
   * from the request and dropping scopes you did not configure. Return a string
   * array to replace `input.proposedScopes`. Return `undefined` or `null` to
   * accept `input.proposedScopes`.
   *
   * Authproto still keeps only configured scopes and always keeps `"atproto"`.
   * Omit this for one scope policy across every account.
   */
  resolveScopesEntrypoint?: string;
  /**
   * Redirect settings after login/logout.
   */
  redirects?: {
    afterLogin?: string;
    afterLogout?: string;
  };
}

export const getHooksImport = (resolveScopesEntrypoint?: string) => {
  if (resolveScopesEntrypoint) {
    return `export { resolveScopes } from ${JSON.stringify(resolveScopesEntrypoint)};`;
  }
  return `export const resolveScopes = null;`;
};

export const getStoresImport = (driverName?: string) => {
  if (driverName === "astro:db") {
    return `export { StateStore, SessionStore } from "@fujocoded/authproto/stores/db";`;
  }
  return `export { StateStore, SessionStore } from "@fujocoded/authproto/stores/unstorage";`;
};

const resolveScopesOption = (scopesOption?: ScopesOption): OAuthScope[] => {
  const resolved: OAuthScope[] = ["atproto"];
  if (Array.isArray(scopesOption)) {
    resolved.push(...scopesOption);
  } else {
    if (scopesOption?.email) {
      resolved.push("transition:email");
    }
    if (scopesOption?.genericData) {
      resolved.push("transition:generic");
    }
    if (scopesOption?.directMessages) {
      resolved.push("transition:chat.bsky");
    }
    resolved.push(...(scopesOption?.additionalScopes ?? []));
  }
  return [...new Set(resolved)];
};

const exportConst = (name: string, value: unknown): string =>
  `export const ${name} = ${JSON.stringify(value)};`;

export const getConfig = ({
  options,
  isDev,
  devPort,
  devServerHost,
}: {
  options: ConfigOptions;
  isDev: boolean;
  devPort?: number;
  devServerHost?: string | boolean;
}) => {
  const isDevServerHostSet = Boolean(devServerHost);
  const finalDriver = options.driver ?? {
    name: "memory",
    options: undefined,
  };

  const externalDomain =
    options.externalDomain ??
    (isDev
      ? `http://127.0.0.1:${devPort ?? 4321}/`
      : options.applicationDomain);

  const scopes = resolveScopesOption(options.scopes);
  const defaultScopes = options.defaultScopes
    ? resolveScopesOption(options.defaultScopes)
    : scopes;

  let driversImport = "";
  if (finalDriver.name !== "astro:db") {
    driversImport = `
    import driver from "unstorage/drivers/${finalDriver.name}";

    export const storage = createStorage({
      driver: driver(${JSON.stringify(finalDriver.options)}),
    });
    `;
  } else {
    driversImport = `
    export const storage = null;
    `;
  }

  return `
    import { createStorage } from "unstorage";

    ${driversImport}
    
    ${exportConst("applicationName", options.applicationName)}
    ${exportConst("applicationDomain", options.applicationDomain)}
    ${exportConst("defaultDevUser", options.defaultDevUser ?? null)}
    ${exportConst("scopes", scopes)}
    ${exportConst("defaultScopes", defaultScopes)}
    ${exportConst("driverName", finalDriver.name)}
    ${exportConst("redirectAfterLogin", options.redirects?.afterLogin ?? "{referer}")}
    ${exportConst("redirectAfterLogout", options.redirects?.afterLogout ?? "{referer}")}
    ${exportConst("externalDomain", externalDomain)}
    export const clientMetadataDomain = process.env.AUTHPROTO_EXTERNAL_DOMAIN ?? ${JSON.stringify(externalDomain)} ?? ${JSON.stringify(options.applicationDomain)};
    ${exportConst("isDevServerHostSet", isDevServerHostSet)}
    ${exportConst("isDev", isDev)}
    `;
};
