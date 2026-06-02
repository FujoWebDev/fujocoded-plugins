import type { OAuthScope } from "./config.js";

type RepoAction = "create" | "update" | "delete";
type AccountAction = "read" | "manage";
type AccountAttr = "email" | "repo" | (string & {});
type IdentityAttr = "handle" | "*";
type OneOrMany<T> = T | readonly T[];

type RepoPermissionOptions = {
  action?: OneOrMany<RepoAction>;
};

type RpcPermissionOptions = {
  aud: string;
};

type AccountPermissionOptions = {
  action?: AccountAction;
};

type IncludePermissionOptions = {
  aud?: string;
};

const encodeValue = (value: string) => encodeURIComponent(value);

const isReadonlyArray = <T>(value: OneOrMany<T>): value is readonly T[] =>
  Array.isArray(value);

const asArray = <T>(value: OneOrMany<T>): T[] =>
  isReadonlyArray(value) ? [...value] : [value];

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const appendParams = (
  params: URLSearchParams,
  name: string,
  value: OneOrMany<string> | undefined,
) => {
  if (value === undefined) {
    return;
  }
  for (const item of unique(asArray(value))) {
    params.append(name, item);
  }
};

const buildScope = ({
  resource,
  positionalName,
  positionalValue,
  params,
}: {
  resource: string;
  positionalName: string;
  positionalValue: string | undefined;
  params?: Record<string, OneOrMany<string> | undefined>;
}): OAuthScope => {
  const searchParams = new URLSearchParams();
  for (const [name, value] of Object.entries(params ?? {})) {
    appendParams(searchParams, name, value);
  }

  const query = searchParams.toString();
  if (positionalValue !== undefined) {
    return `${resource}:${encodeValue(positionalValue)}${query ? `?${query}` : ""}`;
  }
  if (query) {
    return `${resource}?${query}`;
  }
  throw new Error(
    `Cannot build ${resource} permission without ${positionalName} or parameters.`,
  );
};

const assertNonEmpty = (resource: string, name: string, values: string[]) => {
  if (values.length === 0) {
    throw new Error(`Cannot build ${resource} permission without ${name}.`);
  }
};

const assertNoPartialWildcard = (
  resource: string,
  name: string,
  values: readonly string[],
) => {
  for (const value of values) {
    if (value.includes("*") && value !== "*") {
      throw new Error(
        `${resource} permission ${name} does not support partial wildcards: ${value}`,
      );
    }
  }
};

export const repo = (
  collection: OneOrMany<string>,
  options: RepoPermissionOptions = {},
): OAuthScope => {
  const collections = unique(asArray(collection));
  assertNonEmpty("repo", "collection", collections);
  assertNoPartialWildcard("repo", "collection", collections);

  return buildScope({
    resource: "repo",
    positionalName: "collection",
    positionalValue: collections.length === 1 ? collections[0] : undefined,
    params: {
      collection: collections.length > 1 ? collections : undefined,
      action: options.action,
    },
  });
};

export const rpc = (
  lxm: OneOrMany<string>,
  options: RpcPermissionOptions,
): OAuthScope => {
  const lxms = unique(asArray(lxm));
  assertNonEmpty("rpc", "lxm", lxms);
  assertNoPartialWildcard("rpc", "lxm", lxms);
  if (lxms.includes("*") && options.aud === "*") {
    throw new Error('rpc permission cannot use both lxm="*" and aud="*".');
  }

  return buildScope({
    resource: "rpc",
    positionalName: "lxm",
    positionalValue: lxms.length === 1 ? lxms[0] : undefined,
    params: {
      lxm: lxms.length > 1 ? lxms : undefined,
      aud: options.aud,
    },
  });
};

export const blob = (accept: OneOrMany<string>): OAuthScope => {
  const accepts = unique(asArray(accept));
  assertNonEmpty("blob", "accept", accepts);

  return buildScope({
    resource: "blob",
    positionalName: "accept",
    positionalValue: accepts.length === 1 ? accepts[0] : undefined,
    params: {
      accept: accepts.length > 1 ? accepts : undefined,
    },
  });
};

export const account = (
  attr: AccountAttr,
  options: AccountPermissionOptions = {},
): OAuthScope =>
  buildScope({
    resource: "account",
    positionalName: "attr",
    positionalValue: attr,
    params: {
      action: options.action,
    },
  });

export const identity = (attr: IdentityAttr): OAuthScope =>
  buildScope({
    resource: "identity",
    positionalName: "attr",
    positionalValue: attr,
  });

export const include = (
  nsid: string,
  options: IncludePermissionOptions = {},
): OAuthScope =>
  buildScope({
    resource: "include",
    positionalName: "nsid",
    positionalValue: nsid,
    params: {
      aud: options.aud,
    },
  });

export const permissionScopes = (
  scopes: readonly (OAuthScope | false | null | undefined)[],
): OAuthScope[] =>
  unique(scopes.filter((scope): scope is OAuthScope => !!scope));
