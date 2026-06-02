import { describe, expect, test, vi } from "vitest";

import {
  AUTHPROTO_DID,
  AUTHPROTO_SCOPES,
  persistLoginGrant,
} from "../src/lib/session-state.ts";
import { POST } from "../src/routes/oauth/logout.ts";
import { createSession, redirect } from "./support/session.ts";
import { TEST_ACCOUNT_DID } from "./support/auth-fixtures.ts";

describe("oauth logout route", () => {
  test("redirects when logout is attempted without a login grant", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const session = createSession();
    const response = await POST({
      request: new Request("http://127.0.0.1:4321/oauth/logout", {
        method: "POST",
        body: new URLSearchParams(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: "http://127.0.0.1:4321/start",
        },
      }),
      session,
      redirect,
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(consoleError).toHaveBeenCalledWith(
      "User is not logged in but logout was attempted.",
    );

    consoleError.mockRestore();
  });

  test("clears the local session when the OAuth session was already deleted", async () => {
    const session = createSession();
    await persistLoginGrant(session, {
      did: TEST_ACCOUNT_DID,
      scopes: ["atproto"],
    });

    const response = await POST({
      request: new Request("http://127.0.0.1:4321/oauth/logout", {
        method: "POST",
        body: new URLSearchParams(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: "http://127.0.0.1:4321/start",
        },
      }),
      session,
      redirect,
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(await session.get(AUTHPROTO_DID)).toBeUndefined();
    expect(await session.get(AUTHPROTO_SCOPES)).toBeUndefined();
  });

  test("reads redirect from form body and applies it on logout", async () => {
    // Wiring proof only: getRedirectUrl tests are in redirects.test.ts. This
    // is testing that the logout route reads the redirect form field and passes
    // it to getRedirectUrl.
    const session = createSession();
    await persistLoginGrant(session, {
      did: TEST_ACCOUNT_DID,
      scopes: ["atproto"],
    });

    const response = await POST({
      request: new Request("http://127.0.0.1:4321/oauth/logout", {
        method: "POST",
        body: new URLSearchParams({ redirect: "/goodbye" }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: "http://127.0.0.1:4321/events",
        },
      }),
      session,
      redirect,
    } as Parameters<typeof POST>[0]);

    expect(response.headers.get("location")).toBe("/goodbye");
  });
});
