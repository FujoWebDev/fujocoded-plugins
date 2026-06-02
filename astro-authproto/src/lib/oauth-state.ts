import type { OAuthScope } from "./config.js";

export type OAuthState = {
  scopes: OAuthScope[];
  redirect?: string;
  referer?: string;
};

export const encodeOAuthState = (state: OAuthState): string =>
  Buffer.from(JSON.stringify(state)).toString("base64url");

export const decodeOAuthState = (
  encoded: string | null | undefined,
): Partial<OAuthState> => {
  if (!encoded) {
    return {};
  }

  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString()) as {
      scopes?: unknown;
      redirect?: unknown;
      referer?: unknown;
    };
    return {
      ...(Array.isArray(value.scopes) &&
        value.scopes.every(
          (scope): scope is OAuthScope => typeof scope === "string",
        ) && {
          scopes: value.scopes,
        }),
      ...(typeof value.redirect === "string" && { redirect: value.redirect }),
      ...(typeof value.referer === "string" && { referer: value.referer }),
    };
  } catch {
    return {};
  }
};
