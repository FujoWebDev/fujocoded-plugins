import type { BuiltinDriverOptions } from "unstorage";

type AstroDriverOption = { name: "astro:db"; options?: never };
type OptionsType<
  T extends keyof BuiltinDriverOptions = keyof BuiltinDriverOptions,
> = {
  name: T;
  options: BuiltinDriverOptions[T];
};
export type AllDriverOptions =
  | {
      [K in keyof BuiltinDriverOptions]: OptionsType<K>;
    }[keyof BuiltinDriverOptions]
  | { name: "astro:db"; options?: never };

export type OAuthScope =
  | "atproto"
  | "transition:email"
  | "transition:generic"
  | "transition:chat.bsky"
  | string;
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
  scopes?:
    | OAuthScope[]
    | {
        email?: boolean;
        genericData?: boolean;
        directMessages?: boolean;
        additionalScopes?: OAuthScope[];
      };
  redirects?: {
    afterLogin?: string;
    afterLogout?: string;
  };
}

export const getConfig = ({ options, isDev }: { options: ConfigOptions, isDev: boolean }) => {
  const finalDriver = options.driver ?? {
    name: "memory",
    options: undefined,
  };

  const externalDomain = options.externalDomain ?? (isDev ? "http://127.0.0.1:4321/" : undefined);

  const scopes: OAuthScope[] = ["atproto"];
  if (Array.isArray(options.scopes)) {
    scopes.push(...options.scopes);
  } else {
    if (options.scopes?.email) {
      scopes.push("transition:email");
    }
    if (options.scopes?.genericData) {
      scopes.push("transition:generic");
    }
    if (options.scopes?.directMessages) {
      scopes.push("transition:chat.bsky");
    }
    scopes.push(...(options.scopes?.additionalScopes ?? []));
  }

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
    export const driverName = "${finalDriver.name}";
    export const redirectAfterLogin = ${JSON.stringify(
      options.redirects?.afterLogin ?? "/"
    )};
    export const redirectAfterLogout = ${JSON.stringify(
      options.redirects?.afterLogout ?? "/"
    )};
    export const externalDomain = ${JSON.stringify(externalDomain)};
    `;
};
