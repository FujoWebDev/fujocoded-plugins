import { beforeEach, describe, expect, test, vi } from "vitest";

import { encodeOAuthState } from "../src/lib/oauth-state.ts";
import { getRedirectUrl } from "../src/lib/redirects.ts";
import { persistLoginGrant } from "../src/lib/session-state.ts";
import { GET as CALLBACK } from "../src/routes/oauth/callback.ts";
import { POST as LOGOUT } from "../src/routes/oauth/logout.ts";
import {
  TEST_ACCOUNT_DID,
  TEST_ACCOUNT_HANDLE,
} from "./support/auth-fixtures.ts";
import { createSession, redirect } from "./support/session.ts";

let mockOAuthCallbackResult: {
  session: { did: string };
  state: string;
} | null = null;

vi.mock("../src/lib/auth.ts", async (importActual) => {
  const actual = await importActual<typeof import("../src/lib/auth.ts")>();
  return {
    ...actual,
    getOAuthClient: async () => {
      if (!mockOAuthCallbackResult) {
        return actual.getOAuthClient();
      }
      const result = mockOAuthCallbackResult;
      return {
        callback: async () => result,
      } as unknown as Awaited<ReturnType<typeof actual.getOAuthClient>>;
    },
  };
});

beforeEach(() => {
  mockOAuthCallbackResult = null;
});

describe("getRedirectUrl template substitution", () => {
  test.each([
    {
      label: "explicit redirect path",
      redirectToBase: "/welcome",
      referer: "http://127.0.0.1:4321/events",
      expected: "/welcome",
    },
    {
      label: "{referer} template",
      redirectToBase: "{referer}",
      referer: "http://127.0.0.1:4321/events?tab=upcoming",
      expected: "http://127.0.0.1:4321/events?tab=upcoming",
    },
    {
      label: "{referer} template with extra params",
      redirectToBase: "{referer}?welcome=true",
      referer: "http://127.0.0.1:4321/events?tab=upcoming",
      expected: "http://127.0.0.1:4321/events?tab=upcoming&welcome=true",
    },
    {
      label: "{loggedInUser.did} template",
      redirectToBase: "/users/{loggedInUser.did}/home",
      referer: "http://127.0.0.1:4321/events",
      expected: `/users/${TEST_ACCOUNT_DID}/home`,
    },
    {
      label: "{loggedInUser.handle} template",
      redirectToBase: "/users/{loggedInUser.handle}/home",
      referer: "http://127.0.0.1:4321/events",
      expected: `/users/${TEST_ACCOUNT_HANDLE}/home`,
    },
  ])("substitutes $label", async ({ redirectToBase, referer, expected }) => {
    await expect(
      getRedirectUrl({ redirectToBase, did: TEST_ACCOUNT_DID, referer }),
    ).resolves.toBe(expected);
  });

  test("falls back to / when the substituted redirect is empty", async () => {
    await expect(
      getRedirectUrl({
        redirectToBase: "{referer}",
        did: TEST_ACCOUNT_DID,
        referer: "",
      }),
    ).resolves.toBe("/");
  });
});

describe("route wiring", () => {
  test("logout route forwards form redirect and referer through getRedirectUrl", async () => {
    const session = createSession();
    await persistLoginGrant(session, {
      did: TEST_ACCOUNT_DID,
      scopes: ["atproto"],
    });

    const response = await LOGOUT({
      request: new Request("http://127.0.0.1:4321/oauth/logout", {
        method: "POST",
        body: new URLSearchParams({ redirect: "{referer}?reason=logged-out" }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: "http://127.0.0.1:4321/events?tab=upcoming",
        },
      }),
      session,
      redirect,
    } as Parameters<typeof LOGOUT>[0]);

    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:4321/events?tab=upcoming&reason=logged-out",
    );
  });

  test("callback route forwards state redirect and referer through getRedirectUrl", async () => {
    const appState = encodeOAuthState({
      scopes: ["atproto"],
      redirect: "/users/{loggedInUser.handle}/home",
      referer: "http://127.0.0.1:4321/start",
    });
    mockOAuthCallbackResult = {
      session: { did: TEST_ACCOUNT_DID },
      state: appState,
    };

    const session = createSession();
    const response = await CALLBACK({
      request: new Request(
        "http://127.0.0.1:4321/oauth/callback?code=test-code&state=anything",
      ),
      session,
      redirect,
    } as Parameters<typeof CALLBACK>[0]);

    expect(response.headers.get("location")).toBe(
      `/users/${TEST_ACCOUNT_HANDLE}/home`,
    );
  });
});
