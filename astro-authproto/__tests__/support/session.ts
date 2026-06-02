import {
  AUTHPROTO_DID,
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_ERROR_DESCRIPTION,
  AUTHPROTO_ERROR_URI,
  AUTHPROTO_SCOPES,
  type AuthprotoSession,
} from "../../src/lib/session-state.ts";

export type TestSession = AuthprotoSession;

export const createSession = (
  initialValues: Record<string, unknown> = {},
): TestSession => {
  const values: Record<string, unknown> = {
    [AUTHPROTO_DID]: undefined,
    [AUTHPROTO_SCOPES]: undefined,
    [AUTHPROTO_ERROR_CODE]: undefined,
    [AUTHPROTO_ERROR_DESCRIPTION]: undefined,
    [AUTHPROTO_ERROR_URI]: undefined,
    ...initialValues,
  };

  return {
    async get(key: string) {
      return values[key];
    },
    set(key: string, value: unknown) {
      values[key] = value;
    },
    delete(key: string) {
      delete values[key];
    },
  } as TestSession;
};

export const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { location },
  });
