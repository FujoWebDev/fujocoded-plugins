import { describe, expect, test } from "vitest";

import { decodeOAuthState } from "../src/lib/oauth-state.ts";
import {
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_ERROR_DESCRIPTION,
} from "../src/lib/session-state.ts";
import { POST } from "../src/routes/oauth/login.ts";
import {
  TEST_ACCOUNT_AUTH_SERVER,
  TEST_ACCOUNT_PDS,
} from "./support/auth-fixtures.ts";
import { parRequests } from "./support/msw.ts";
import { createSession, redirect } from "./support/session.ts";
import { SCOPE_RESOLVER_THROWS_ID } from "./virtual/hooks.ts";
import { getTestStateAppState } from "./virtual/stores.ts";

const postLogin = async ({
  atprotoId,
  referer = "http://127.0.0.1:4321/start",
  redirectTo,
  scopes = [],
}: {
  atprotoId?: string;
  referer?: string;
  redirectTo?: string;
  scopes?: string[];
}) => {
  const body = new URLSearchParams();
  if (atprotoId !== undefined) {
    body.set("atproto-id", atprotoId);
  }
  if (redirectTo !== undefined) {
    body.set("redirect", redirectTo);
  }
  for (const scope of scopes) {
    body.append("scope", scope);
  }

  const request = new Request("http://127.0.0.1:4321/oauth/login", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer,
    },
  });

  const session = createSession();
  const response = await POST({
    request,
    session,
    redirect,
  } as Parameters<typeof POST>[0]);

  return { response, session };
};

describe("oauth login route", () => {
  test("starts the ATProto OAuth flow through mocked discovery and PAR endpoints", async () => {
    const { response, session } = await postLogin({
      atprotoId: TEST_ACCOUNT_PDS,
    });
    const location = response.headers.get("location");

    expect(response.status).toBe(302);
    expect(location).toBeTruthy();
    expect({
      code: await session.get(AUTHPROTO_ERROR_CODE),
      description: await session.get(AUTHPROTO_ERROR_DESCRIPTION),
    }).toEqual({ code: undefined, description: undefined });

    const redirectUrl = new URL(location!);
    expect(redirectUrl.origin).toBe(TEST_ACCOUNT_AUTH_SERVER);
    expect(redirectUrl.pathname).toBe("/oauth/authorize");
    expect(redirectUrl.searchParams.get("request_uri")).toBe(
      "urn:ietf:params:oauth:request_uri:test-request",
    );

    expect(parRequests).toHaveLength(1);
    expect(parRequests[0]?.get("login_hint")).toBeNull();
    expect(parRequests[0]?.get("scope")).toBe("atproto transition:generic");
    expect(parRequests[0]?.get("redirect_uri")).toBe(
      "http://127.0.0.1:4321/oauth/callback",
    );
    expect(parRequests[0]?.get("client_id")).toContain("http://localhost");
    expect(
      decodeOAuthState(getTestStateAppState(parRequests[0]?.get("state"))),
    ).toEqual({
      scopes: ["atproto", "transition:generic"],
      referer: "http://127.0.0.1:4321/start",
    });
  });

  test("stores custom redirects in OAuth state instead of the referer", async () => {
    await postLogin({
      atprotoId: TEST_ACCOUNT_PDS,
      referer: "http://127.0.0.1:4321/events",
      redirectTo: "/welcome",
    });

    expect(parRequests).toHaveLength(1);
    expect(
      decodeOAuthState(getTestStateAppState(parRequests[0]?.get("state"))),
    ).toEqual({
      scopes: ["atproto", "transition:generic"],
      redirect: "/welcome",
    });
  });

  test("forwards resolved scopes to the PAR scope param and state", async () => {
    await postLogin({
      atprotoId: TEST_ACCOUNT_PDS,
      scopes: ["transition:email"],
    });

    expect(parRequests).toHaveLength(1);
    expect(parRequests[0]?.get("scope")).toBe("atproto transition:email");
    expect(
      decodeOAuthState(getTestStateAppState(parRequests[0]?.get("state"))),
    ).toEqual({
      scopes: ["atproto", "transition:email"],
      referer: "http://127.0.0.1:4321/start",
    });
  });

  test("stores a session error when the login form is missing atproto-id", async () => {
    const { response, session } = await postLogin({ atprotoId: undefined });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:4321/start",
    );
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBe("MISSING_FIELD");
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBe(
      'Missing required "atproto-id" field in login form data',
    );
    expect(parRequests).toHaveLength(0);
  });

  test("stores a session error when the scope resolver fails", async () => {
    const { response, session } = await postLogin({
      atprotoId: SCOPE_RESOLVER_THROWS_ID,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:4321/start",
    );
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBe("Error");
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBe(
      "scope resolver failed",
    );
    expect(parRequests).toHaveLength(0);
  });
});
