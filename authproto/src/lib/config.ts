import type { BuiltinDriverOptions } from "unstorage";

type AstroDriverOption = { name: "astro:db"; options?: never };
type OptionsType<
  T extends keyof BuiltinDriverOptions = keyof BuiltinDriverOptions
> = {
  name: T;
  options: BuiltinDriverOptions[T];
};
type AllDriverOptions =
  | {
      [K in keyof BuiltinDriverOptions]: OptionsType<K>;
    }[keyof BuiltinDriverOptions]
  | { name: "astro:db"; options?: never };

export interface ConfigOptions {
  applicationName: string;
  applicationDomain: string;
  defaultDevUser?: string;
  driver?: AllDriverOptions | AstroDriverOption;
}

export const getConfig = ({ options }: { options: ConfigOptions }) => {
  const finalDriver = options.driver ?? {
    name: "memory",
    options: undefined,
  };

  return `
    import { createStorage } from "unstorage";
    import driver from "unstorage/drivers/${finalDriver.name}";
    
    export const applicationName = "${options.applicationName}";
    export const applicationDomain = "${options.applicationDomain}";
    export const defaultDevUser = ${JSON.stringify(
      options.defaultDevUser ?? null
    )};
    export const storage = createStorage({
      driver: driver(${JSON.stringify(finalDriver.options)}),
    });
    `;
};
