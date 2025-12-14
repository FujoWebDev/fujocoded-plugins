/**
 * Type definitions for "fujocoded:authproto/config".
 *
 * This file declares types for fujocoded:authproto's virtual modules. These
 * modules are "imports" that don't map to real files, but are injected into the
 * application by Vite.
 *
 * We need a sepate type definition file for virtual modules, because TypeScript has
 * two separate modes for .d.ts files:
 * 1. "Script" mode, which can declare new modules (does NOT support import/export)
 * 2. "Module" mode, which can only augment existing modules (supports import/export)
 *
 * In this case, we need both types, so we add this file (config-module.d.ts) for module
 * declarations.
 *
 * See: https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files#module-augmentation-vs-module-overriding
 */
declare module "fujocoded:authproto/config" {
  export const applicationName: string;
  export const applicationDomain: string;
  export const defaultDevUser: string | null;
  export const externalDomain: string | undefined;
  export const storage: import("unstorage").Storage | null;
  export const scopes: string[];
  export const driverName: string;
  export const redirectAfterLogin: string;
  export const redirectAfterLogout: string;
}

declare module "fujocoded:authproto/stores" {
  export {
    StateStore,
    SessionStore,
  } from "@fujocoded/authproto/stores/unstorage";
}

// astro:db types - @astrojs/db is an optional peer dependency
declare module "astro:db" {
  export const db: any;
  export function eq(column: any, value: any): any;
  export function defineDb(config: any): any;
  export function defineTable(config: any): any;
  export const column: {
    text(): any;
    number(): any;
    boolean(): any;
    date(): any;
    json(): any;
  };
}
