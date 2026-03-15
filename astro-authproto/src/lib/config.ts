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
  | string;

export type ScopesOption =
  | OAuthScope[]
  | {
      email?: boolean;
      genericData?: boolean;
      directMessages?: boolean;
      additionalScopes?: OAuthScope[];
    };

export interface ConfigOptions {
  applicationName: string;
  applicationDomain: string;
  defaultDevUser?: string;
  externalDomain?: string;
  driver?: AllDriverOptions | AstroDriverOption;
  // atproto => must have
  // transition:email => email address + confirmation status
  // transition:generic => write/read all data except DMs
  // transition:chat.bsky => chat.bsky Lexicons
  scopes?: ScopesOption;
  /** Scopes requested when no per-request scopes are specified. Defaults to all configured scopes. */
  defaultScopes?: ScopesOption;
  /** Path to a module exporting a resolveScopes hook: (atprotoId: string, scopes: string[]) => string[] | Promise<string[]> */
  resolveScopesEntrypoint?: string;
  redirects?: {
    afterLogin?: string;
    afterLogout?: string;
  };
  /*
  dev: {
      defaultUser?: string;
      devDriver?: AllDriverOptions | AstroDriverOption;
  }
  */
}

export const getHooksImport = (resolveScopesEntrypoint?: string) => {
  if (resolveScopesEntrypoint) {
    return `export { default as resolveScopes } from ${JSON.stringify(resolveScopesEntrypoint)};`;
  }
  return `export const resolveScopes = null;`;
};

export const getStoresImport = (driverName?: string) => {
  if (driverName === "astro:db") {
    return `export { StateStore, SessionStore } from "@fujocoded/authproto/stores/db";`;
  }
  return `export { StateStore, SessionStore } from "@fujocoded/authproto/stores/unstorage";`;
};

const resolveScopes = (scopesOption?: ScopesOption): OAuthScope[] => {
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
  return resolved;
};

export const getConfig = ({ options, isDev }: { options: ConfigOptions, isDev: boolean }) => {
  const finalDriver = options.driver ?? {
    name: "memory",
    options: undefined,
  };

  const externalDomain = options.externalDomain ?? (isDev ? "http://127.0.0.1:4321/" : options.applicationDomain);

  const scopes = resolveScopes(options.scopes);
  const defaultScopes = options.defaultScopes
    ? resolveScopes(options.defaultScopes)
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
    
    export const applicationName = "${options.applicationName}";
    export const applicationDomain = "${options.applicationDomain}";
    export const defaultDevUser = ${JSON.stringify(
      options.defaultDevUser ?? null
    )};
    export const scopes = ${JSON.stringify(scopes)};
    export const defaultScopes = ${JSON.stringify(defaultScopes)};
    export const driverName = "${finalDriver.name}";
    export const redirectAfterLogin = ${JSON.stringify(
      options.redirects?.afterLogin ?? "/"
    )};
    export const redirectAfterLogout = ${JSON.stringify(
      options.redirects?.afterLogout ?? "/"
    )};
    export const externalDomain = ${JSON.stringify(externalDomain)};
    export const clientMetadataDomain = process.env.AUTHPROTO_EXTERNAL_DOMAIN ?? ${JSON.stringify(externalDomain)} ?? "${options.applicationDomain}";
    `;
};
