import type { AstroSession } from "astro";
import type { OAuthScope } from "./config.js";

export const AUTHPROTO_ERROR_CODE = "authproto-error-code";
export const AUTHPROTO_ERROR_DESCRIPTION = "authproto-error-description";
export const AUTHPROTO_ERROR_URI = "authproto-error-uri";
export const AUTHPROTO_SCOPES = "atproto-scopes";
export const AUTHPROTO_DID = "atproto-did";

type AuthprotoSession = Pick<AstroSession, "get" | "set" | "delete">;

type AuthprotoError = {
  code?: string;
  description?: string;
  uri?: string;
};

type LoginGrant = {
  did: string;
  scopes?: readonly unknown[];
};

export const persistAuthprotoError = async (
  session: AuthprotoSession | undefined,
  { code, description, uri }: AuthprotoError,
) => {
  session?.set(AUTHPROTO_ERROR_CODE, code ?? "UNKNOWN");
  session?.set(AUTHPROTO_ERROR_DESCRIPTION, description ?? code);
  session?.set(AUTHPROTO_ERROR_URI, uri);
};

export const persistLoginGrant = async (
  session: AuthprotoSession | undefined,
  { did, scopes }: LoginGrant,
) => {
  session?.set(AUTHPROTO_DID, did);
  if (scopes) {
    session?.set(
      AUTHPROTO_SCOPES,
      scopes.filter((scope): scope is OAuthScope => typeof scope === "string"),
    );
  }
};

export const readAndClearAuthprotoError = async (
  session: AuthprotoSession | undefined,
): Promise<AuthprotoError | null> => {
  const [code, description, uri] = await Promise.all([
    session?.get(AUTHPROTO_ERROR_CODE),
    session?.get(AUTHPROTO_ERROR_DESCRIPTION),
    session?.get(AUTHPROTO_ERROR_URI),
  ]);

  if (!code && !description && !uri) {
    return null;
  }

  // Clear the error as we read it. It should be present in the one page rendered
  // right after a failed login, then disappear, so a later unrelated page does
  // not still show it and look like its own login failed.
  session?.delete(AUTHPROTO_ERROR_CODE);
  session?.delete(AUTHPROTO_ERROR_DESCRIPTION);
  session?.delete(AUTHPROTO_ERROR_URI);

  return {
    code: typeof code === "string" ? code : undefined,
    description: typeof description === "string" ? description : undefined,
    uri: typeof uri === "string" ? uri : undefined,
  };
};

export const readSessionGrant = async (
  session: AuthprotoSession | undefined,
): Promise<{ did?: string; scopes: OAuthScope[] }> => {
  const did = await session?.get(AUTHPROTO_DID);
  const scopes = await session?.get(AUTHPROTO_SCOPES);
  return {
    did: typeof did === "string" ? did : undefined,
    scopes: Array.isArray(scopes)
      ? scopes.filter((scope): scope is OAuthScope => typeof scope === "string")
      : [],
  };
};

export const clearSessionGrant = async (
  session: AuthprotoSession | undefined,
) => {
  session?.delete(AUTHPROTO_DID);
  session?.delete(AUTHPROTO_SCOPES);
};
