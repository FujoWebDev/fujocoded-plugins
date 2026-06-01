import { describe, expect, test } from "vitest";
import { http, HttpResponse } from "msw";

import { decodeOAuthState, encodeOAuthState } from "../src/lib/oauth-state.ts";
import {
  AUTHPROTO_DID,
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_ERROR_DESCRIPTION,
  AUTHPROTO_ERROR_URI,
  AUTHPROTO_SCOPES,
} from "../src/lib/session-state.ts";
import { POST } from "../src/routes/oauth/login.ts";
import { GET } from "../src/routes/oauth/callback.ts";
import {
  TEST_ACCOUNT_AUTH_SERVER,
  TEST_ACCOUNT_PDS,
} from "./support/auth-fixtures.ts";
import { parRequests, server } from "./support/msw.ts";
import { createSession, redirect } from "./support/session.ts";

const getCallback = async (url: string) => {
  const session = createSession();
  const response = await GET({
    request: new Request(url),
    session,
    redirect,
  } as Parameters<typeof GET>[0]);

  return { response, session };
};

describe("decodeOAuthState", () => {
  test("round-trips the fields the package owns and ignores unknown ones", () => {
    // Hand-rolled payload includes a field the package doesn't own
    // ("legacy_csrf") so we can prove the decoder strips it rather than
    // surfacing arbitrary keys from the OAuth state param into our code.
    const state = Buffer.from(
      JSON.stringify({
        legacy_csrf: "test-csrf",
        scopes: ["atproto", "transition:generic"],
        referer: "http://127.0.0.1:4321/start",
        ignored: true,
      }),
    ).toString("base64url");

    expect(decodeOAuthState(state)).toEqual({
      scopes: ["atproto", "transition:generic"],
      referer: "http://127.0.0.1:4321/start",
    });
  });

  test("survives malformed input by returning an empty object", () => {
    // The OAuth state param is attacker-controllable in callback URLs, so
    // a bad base64/JSON payload must not throw.
    expect(decodeOAuthState("not-base64-json")).toEqual({});
  });

  test("encode then decode preserves the owned fields", () => {
    const original = {
      scopes: ["atproto", "transition:generic"] as [
        "atproto",
        "transition:generic",
      ],
      referer: "http://127.0.0.1:4321/start",
    };

    expect(decodeOAuthState(encodeOAuthState(original))).toEqual(original);
  });
});

describe("oauth callback route", () => {
  test("preserves provider callback errors before validating OAuth state", async () => {
    const { response, session } = await getCallback(
      "http://127.0.0.1:4321/oauth/callback?error=lexError&error_description=%40atproto%2Flexicon%20validation%20test&error_uri=https%3A%2F%2Fauth.fujocoded.test%2Ferrors%2FlexError&unknown=ignored",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBe("lexError");
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBe(
      "@atproto/lexicon validation test",
    );
    expect(await session.get(AUTHPROTO_ERROR_URI)).toBe(
      "https://auth.fujocoded.test/errors/lexError",
    );
    expect(await session.get("unknown")).toBeUndefined();
  });

  test("stores an invalid callback error when there is neither code nor provider error", async () => {
    const { response, session } = await getCallback(
      "http://127.0.0.1:4321/oauth/callback",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBe("INVALID_CALLBACK");
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBe(
      'Missing required "code" parameter in OAuth callback',
    );
  });

  test("preserves provider errors on malformed callbacks with both code and error", async () => {
    const { response, session } = await getCallback(
      "http://127.0.0.1:4321/oauth/callback?code=test-code&error=access_denied&error_description=Denied",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBe("access_denied");
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBe("Denied");
  });

  test("stores an auth error when exchanging a valid callback code fails", async () => {
    server.use(
      http.post(`${TEST_ACCOUNT_AUTH_SERVER}/oauth/token`, () =>
        HttpResponse.json(
          {
            error: "invalid_grant",
            error_description: "The authorization code was rejected.",
          },
          { status: 400 },
        ),
      ),
    );

    const session = createSession();
    await POST({
      request: new Request("http://127.0.0.1:4321/oauth/login", {
        method: "POST",
        body: new URLSearchParams({ "atproto-id": TEST_ACCOUNT_PDS }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: "http://127.0.0.1:4321/start",
        },
      }),
      session,
      redirect,
    } as Parameters<typeof POST>[0]);

    const state = parRequests[0]?.get("state");
    expect(state).toBeTruthy();

    const response = await GET({
      request: new Request(
        `http://127.0.0.1:4321/oauth/callback?code=test-code&state=${encodeURIComponent(state!)}`,
      ),
      session,
      redirect,
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBeTruthy();
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBeTruthy();
    expect(await session.get(AUTHPROTO_DID)).toBeUndefined();
    expect(await session.get(AUTHPROTO_SCOPES)).toBeUndefined();
  });
});
