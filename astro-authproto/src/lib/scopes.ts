import type { OAuthScope } from "./config.js";

/**
 * The account logging in, as typed into the login form. Exactly one of
 * `handle` / `did` is set (whichever the user entered) while the other is
 * `undefined`. Call `resolve()` to fetch the canonical DID and handle together.
 */
export type ResolveScopesAtprotoId = {
  /**
   * Resolves the account to its canonical DID and handle. Does one network
   * lookup for the missing half.
   */
  resolve: () => Promise<{ did: string; handle: string }>;
} & ({ handle: string; did: undefined } | { handle: undefined; did: string });

/**
 * Values passed to your `resolveScopes` hook before Authproto sends the user
 * to their PDS, the server that stores their ATproto account.
 */
export type ResolveScopesInput = {
  /**
   * The account logging in. Exactly one of `atprotoId.handle` /
   * `atprotoId.did` is set; call `atprotoId.resolve()` for both.
   */
  atprotoId: ResolveScopesAtprotoId;
  /**
   * The scopes Authproto is ready to request. Custom form values have already
   * been checked against `allowedScopes`. `"atproto"` is always present.
   */
  proposedScopes: readonly OAuthScope[];
  /**
   * Every scope this app is allowed to request. Authproto builds this from your
   * configured `scopes` and always includes `"atproto"`.
   */
  allowedScopes: readonly OAuthScope[];
  /**
   * The scopes Authproto uses when a login form does not ask for anything
   * specific.
   */
  defaultScopes: readonly OAuthScope[];
};

/**
 * Lets you change the requested scopes for one login.
 *
 * Return a string array to replace `input.proposedScopes`. Return nothing or
 * `null` to keep `input.proposedScopes`. Authproto still keeps only scopes
 * from `input.allowedScopes`, so the hook cannot grant a scope this app did
 * not configure.
 */
export type ResolveScopesHook = (
  input: ResolveScopesInput,
) => OAuthScope[] | void | null | Promise<OAuthScope[] | void | null>;

const uniqueScopes = (scopes: readonly OAuthScope[]): OAuthScope[] => [
  ...new Set(scopes),
];

/**
 * Builds the scope values rendered by the Astro login components. The OAuth
 * login route still does the authoritative configured-scope filtering before
 * redirecting to the provider.
 */
const resolveFormScopes = ({
  defaultScopes,
  extendDefaultScopes,
  withDefaults,
  scopes,
}: {
  defaultScopes: readonly OAuthScope[];
  extendDefaultScopes?: OAuthScope[];
  withDefaults: boolean;
  scopes?: OAuthScope[];
}): OAuthScope[] => {
  if (scopes) {
    return uniqueScopes(["atproto", ...scopes]);
  }

  if (extendDefaultScopes) {
    return uniqueScopes(["atproto", ...defaultScopes, ...extendDefaultScopes]);
  }

  return withDefaults ? uniqueScopes(defaultScopes) : [];
};

export const resolveLoginFormScopes = (input: {
  defaultScopes: readonly OAuthScope[];
  extendDefaultScopes?: OAuthScope[];
  scopes?: OAuthScope[];
}): OAuthScope[] => resolveFormScopes({ ...input, withDefaults: false });

export const resolveAuthorizeFormScopes = (input: {
  defaultScopes: readonly OAuthScope[];
  extendDefaultScopes?: OAuthScope[];
  scopes?: OAuthScope[];
}): OAuthScope[] => resolveFormScopes({ ...input, withDefaults: true });

const normalizeAllowedScopes = (
  configuredScopes: readonly OAuthScope[],
): OAuthScope[] => [...new Set(["atproto", ...configuredScopes])];

const normalizeLoginScopes = (
  scopes: readonly string[],
  allowedScopes: readonly OAuthScope[],
): OAuthScope[] => {
  const allowedScopesSet: ReadonlySet<string> = new Set(allowedScopes);
  const finalScopes = scopes.filter((scope): scope is OAuthScope =>
    allowedScopesSet.has(scope),
  );

  if (!finalScopes.includes("atproto")) {
    finalScopes.unshift("atproto");
  }

  return [...new Set(finalScopes)];
};

/**
 * Picks the final OAuth scopes for a login request.
 *
 * 1. Start from `requestedScopes`, dropping anything not in `configuredScopes`
 * 2. Fall back to `defaultScopes` when the request supplies no configured scopes
 * 3. Always keep `"atproto"`
 * 4. If a `resolveScopes` hook is configured and we know which account is
 *    logging in, call it with a readonly object of the proposed, allowed, and
 *    default scopes. The hook can return a new list, or `undefined` / `null` to
 *    accept the proposed one
 * 5. Filter the hook's output against `configuredScopes` too, so a hook cannot
 *    grant something the app did not declare
 */
export const resolveServerLoginScopes = async ({
  requestedScopes,
  configuredScopes,
  defaultScopes,
  atprotoId,
  resolveScopes,
  resolveIdentity,
}: {
  requestedScopes: readonly string[];
  configuredScopes: readonly OAuthScope[];
  defaultScopes: readonly OAuthScope[];
  atprotoId?: string;
  resolveScopes: null | ResolveScopesHook;
  resolveIdentity?: (
    atprotoId: string,
  ) => Promise<{ did: string; handle: string }>;
}): Promise<OAuthScope[]> => {
  const allowedScopes = Object.freeze(normalizeAllowedScopes(configuredScopes));
  const resolvedDefaultScopes = Object.freeze(
    normalizeLoginScopes(defaultScopes, allowedScopes),
  );
  const requestedAllowedScopes = requestedScopes.filter((scope) =>
    allowedScopes.includes(scope),
  );
  const initialScopes =
    requestedAllowedScopes.length > 0
      ? requestedAllowedScopes
      : resolvedDefaultScopes;

  const proposedScopes = Object.freeze(
    normalizeLoginScopes(initialScopes, allowedScopes),
  );

  if (!resolveScopes || !atprotoId) {
    return [...proposedScopes];
  }

  const resolve = async () => {
    if (!resolveIdentity) {
      throw new Error(
        "resolveScopes called atprotoId.resolve() but no identity resolver is configured",
      );
    }
    return resolveIdentity(atprotoId);
  };
  const atprotoIdInput: ResolveScopesAtprotoId = atprotoId.startsWith("did:")
    ? { did: atprotoId, handle: undefined, resolve }
    : { handle: atprotoId, did: undefined, resolve };

  const resolvedScopes = await resolveScopes({
    atprotoId: atprotoIdInput,
    proposedScopes,
    allowedScopes,
    defaultScopes: resolvedDefaultScopes,
  });

  return normalizeLoginScopes(resolvedScopes ?? proposedScopes, allowedScopes);
};
