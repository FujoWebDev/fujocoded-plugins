// Mocks the `fujocoded:authproto/hooks` virtual module via vitest.config.ts.
// The login route imports `resolveScopes` from here; the special atprotoId
// values below let oauth-login.test.ts exercise hook failure and extension
// paths without needing to mock the virtual module per test.
import type { ResolveScopesHook } from "../../src/lib/scopes.ts";

// atprotoId values that trigger special behavior in the mocked resolveScopes
// hook, letting tests exercise the failure and extension paths.
export const SCOPE_RESOLVER_THROWS_ID = "throws.fujocoded.test";
export const SCOPE_RESOLVER_ADDS_EMAIL_ID = "with-email.fujocoded.test";

export const resolveScopes: ResolveScopesHook = async ({
  atprotoId,
  proposedScopes,
}) => {
  if (atprotoId.handle === SCOPE_RESOLVER_THROWS_ID) {
    throw new Error("scope resolver failed");
  }
  if (atprotoId.handle === SCOPE_RESOLVER_ADDS_EMAIL_ID) {
    return [...proposedScopes, "transition:email"];
  }
};
