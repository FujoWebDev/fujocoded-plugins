import { describe, expect, test } from "vitest";

import {
  AUTHPROTO_ERROR_CODE,
  persistAuthprotoError,
  persistLoginGrant,
  readSessionGrant,
} from "../src/lib/session-state.ts";
import { onRequest } from "../src/routes/middleware.ts";
import { TEST_ACCOUNT_DID } from "./support/auth-fixtures.ts";
import { createSession } from "./support/session.ts";

const next = async () => new Response("ok");

const runMiddleware = async (session: ReturnType<typeof createSession>) => {
  const locals: Record<string, unknown> = {};
  await onRequest(
    { locals, session } as unknown as Parameters<typeof onRequest>[0],
    next,
  );
  return locals;
};

describe("authproto middleware", () => {
  test("shoves a persisted authproto error into locals.authproto", async () => {
    const session = createSession();
    await persistAuthprotoError(session, {
      code: "MISSING_FIELD",
      description: 'Missing required "atproto-id" field in login form data',
    });

    expect(await runMiddleware(session)).toMatchObject({
      authproto: {
        errorCode: "MISSING_FIELD",
        errorDescription:
          'Missing required "atproto-id" field in login form data',
        errorUri: undefined,
      },
    });
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBeUndefined();
  });

  test("sets authproto and logged-in locals to null on a clean session", async () => {
    const locals = await runMiddleware(createSession());

    expect(locals).toEqual({
      authproto: null,
      loggedInUser: null,
      loggedInClient: null,
    });
  });

  test("clears the session grant when the OAuth client cannot restore it", async () => {
    // SessionStore is empty after resetTestStores(), so restore() throws and
    // the middleware should treat the stored DID as stale and wipe it.
    const session = createSession();
    await persistLoginGrant(session, {
      did: TEST_ACCOUNT_DID,
      scopes: ["atproto"],
    });

    const locals = await runMiddleware(session);

    expect(locals).toMatchObject({
      loggedInUser: null,
      loggedInClient: null,
    });
    await expect(readSessionGrant(session)).resolves.toEqual({
      did: undefined,
      scopes: [],
    });
  });
});
