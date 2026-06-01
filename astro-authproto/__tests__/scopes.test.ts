import { describe, expect, test, vi } from "vitest";

import {
  resolveAuthorizeFormScopes,
  resolveLoginFormScopes,
  resolveServerLoginScopes,
} from "../src/lib/scopes.ts";
import { resolveAtprotoIdentity } from "../src/lib/auth.ts";
import {
  TEST_ACCOUNT_DID,
  TEST_ACCOUNT_HANDLE,
} from "./support/auth-fixtures.ts";

describe("authorize form scopes", () => {
  test("returns defaults when no overrides are provided", () => {
    expect(
      resolveAuthorizeFormScopes({
        defaultScopes: ["transition:generic"],
      }),
    ).toEqual(["transition:generic"]);
  });

  test("extendDefaultScopes merges with defaults and atproto, deduplicated", () => {
    expect(
      resolveAuthorizeFormScopes({
        defaultScopes: ["transition:generic"],
        extendDefaultScopes: ["transition:email", "transition:generic"],
      }),
    ).toEqual(["atproto", "transition:generic", "transition:email"]);
  });

  test("lets scopes override defaults entirely", () => {
    expect(
      resolveAuthorizeFormScopes({
        scopes: ["transition:email"],
        defaultScopes: ["transition:generic"],
      }),
    ).toEqual(["atproto", "transition:email"]);
  });
});

describe("login form scopes", () => {
  test("returns an empty list when no overrides are provided", () => {
    // Bare Login forms omit scope fields so the server route can apply defaultScopes.
    expect(
      resolveLoginFormScopes({
        defaultScopes: ["transition:generic"],
      }),
    ).toEqual([]);
  });

  test("extendDefaultScopes still merges defaults even though no-override returns empty", () => {
    // extendDefaultScopes extends defaultScopes; it does not replace them.
    expect(
      resolveLoginFormScopes({
        defaultScopes: ["transition:generic"],
        extendDefaultScopes: ["transition:email"],
      }),
    ).toEqual(["atproto", "transition:generic", "transition:email"]);
  });

  test("lets scopes override defaults entirely", () => {
    expect(
      resolveLoginFormScopes({
        scopes: ["transition:email"],
        defaultScopes: ["transition:generic"],
      }),
    ).toEqual(["atproto", "transition:email"]);
  });
});

describe("server login scopes", () => {
  test("skips resolveScopes when atprotoId is missing", async () => {
    // Non-empty requested scopes isolates the skip behavior from the
    // defaults-fallback path (covered separately below).
    const resolveScopes = vi.fn();

    await expect(
      resolveServerLoginScopes({
        requestedScopes: ["transition:generic"],
        configuredScopes: ["atproto", "transition:generic"],
        defaultScopes: ["transition:email"],
        atprotoId: undefined,
        resolveScopes,
      }),
    ).resolves.toEqual(["atproto", "transition:generic"]);

    expect(resolveScopes).not.toHaveBeenCalled();
  });

  test("filters requestedScopes against configuredScopes before invoking the hook", async () => {
    // The "before" filter: requested scopes the app didn't configure are
    // dropped *before* the hook runs, so a user-supplied hook never sees
    // them.
    const resolveScopes = vi.fn(async ({ proposedScopes }) => [
      // We don't resolve further scopes so if extra ones remains,
      // it must be because it wasn't filtered by the hook.
      ...proposedScopes,
    ]);

    await expect(
      resolveServerLoginScopes({
        requestedScopes: ["transition:email", "transition:not-configured"],
        configuredScopes: ["atproto", "transition:generic", "transition:email"],
        defaultScopes: ["transition:generic"],
        atprotoId: TEST_ACCOUNT_HANDLE,
        resolveScopes,
      }),
      // "transition:not-configured" is dropped (not in configuredScopes),
      // "atproto" is always prepended, and defaultScopes isn't used because the
      // request had at least one allowed scope requested.
    ).resolves.toEqual(["atproto", "transition:email"]);

    expect(resolveScopes).toHaveBeenCalledWith(
      expect.objectContaining({
        // Hook sees the already-filtered list, not the raw requestedScopes.
        proposedScopes: ["atproto", "transition:email"],
        allowedScopes: ["atproto", "transition:generic", "transition:email"],
        defaultScopes: ["atproto", "transition:generic"],
      }),
    );
  });

  test("does not let resolveScopes add unconfigured scopes", async () => {
    // The "after" filter: even if the hook returns scopes the app didn't
    // configure, they are stripped before the OAuth request goes out.
    const resolveScopes = vi.fn(async ({ proposedScopes }) => [
      ...proposedScopes,
      "transition:admin", // not in configuredScopes, must be dropped
      "transition:email", // allowed, kept
      "atproto", // duplicate of what's already in proposedScopes, deduped
    ]);

    await expect(
      resolveServerLoginScopes({
        requestedScopes: ["transition:not-configured", "transition:generic"],
        configuredScopes: ["atproto", "transition:generic", "transition:email"],
        defaultScopes: ["transition:generic"],
        atprotoId: TEST_ACCOUNT_HANDLE,
        resolveScopes,
      }),
      // "transition:admin" dropped (not configured); "atproto" deduped.
      // "transition:generic" survived the pre-hook filter of requestedScopes.
    ).resolves.toEqual(["atproto", "transition:generic", "transition:email"]);

    expect(resolveScopes).toHaveBeenCalledWith({
      atprotoId: expect.objectContaining({
        handle: TEST_ACCOUNT_HANDLE,
        did: undefined,
        resolve: expect.any(Function),
      }),
      proposedScopes: ["atproto", "transition:generic"],
      allowedScopes: ["atproto", "transition:generic", "transition:email"],
      defaultScopes: ["atproto", "transition:generic"],
    });
  });

  test("falls back to default scopes when requested scopes are all unconfigured", async () => {
    await expect(
      resolveServerLoginScopes({
        requestedScopes: ["transition:not-configured"],
        configuredScopes: ["atproto", "transition:generic", "transition:email"],
        defaultScopes: ["transition:email"],
        atprotoId: TEST_ACCOUNT_HANDLE,
        resolveScopes: null,
      }),
    ).resolves.toEqual(["atproto", "transition:email"]);
  });

  test("passes a handle-discriminated atprotoId and a working resolve()", async () => {
    // A handle login exposes `handle` (did undefined). `resolve()` fills in the
    // canonical pair via the MSW-backed production identity resolver.
    const handleHook = vi.fn(async ({ atprotoId, proposedScopes }) => {
      expect(atprotoId).toMatchObject({
        handle: TEST_ACCOUNT_HANDLE,
        did: undefined,
      });
      expect(await atprotoId.resolve()).toEqual({
        did: TEST_ACCOUNT_DID,
        handle: TEST_ACCOUNT_HANDLE,
      });
      return proposedScopes;
    });

    await resolveServerLoginScopes({
      requestedScopes: ["transition:generic"],
      configuredScopes: ["atproto", "transition:generic"],
      defaultScopes: ["transition:generic"],
      atprotoId: TEST_ACCOUNT_HANDLE,
      resolveScopes: handleHook,
      resolveIdentity: resolveAtprotoIdentity,
    });

    expect(handleHook).toHaveBeenCalledOnce();
  });

  test("passes a DID-discriminated atprotoId and a working resolve()", async () => {
    const didHook = vi.fn(async ({ atprotoId, proposedScopes }) => {
      expect(atprotoId).toMatchObject({
        did: TEST_ACCOUNT_DID,
        handle: undefined,
      });
      expect(await atprotoId.resolve()).toEqual({
        did: TEST_ACCOUNT_DID,
        handle: TEST_ACCOUNT_HANDLE,
      });
      return proposedScopes;
    });

    await resolveServerLoginScopes({
      requestedScopes: ["transition:generic"],
      configuredScopes: ["atproto", "transition:generic"],
      defaultScopes: ["transition:generic"],
      atprotoId: TEST_ACCOUNT_DID,
      resolveScopes: didHook,
      resolveIdentity: resolveAtprotoIdentity,
    });

    expect(didHook).toHaveBeenCalledOnce();
  });

  test("accepts void and null resolveScopes returns as proposed scopes", async () => {
    //   1. Hook returns void => package falls back to proposedScopes.
    //   2. Hook returns null => same fallback.
    //   3. Hook inputs are frozen so a hook cannot mutate the package's
    //      internal arrays by accident.
    const voidResolveScopes = vi.fn((input) => {
      // Assertions live inside the hook so we observe the exact object the
      // package passed in, before any return value is processed.
      expect(input).toMatchObject({
        atprotoId: { handle: TEST_ACCOUNT_HANDLE, did: undefined },
        proposedScopes: ["atproto", "transition:generic"],
        allowedScopes: ["atproto", "transition:generic", "transition:email"],
        defaultScopes: ["atproto", "transition:email"],
      });
      expect(Object.isFrozen(input.proposedScopes)).toBe(true);
      expect(Object.isFrozen(input.allowedScopes)).toBe(true);
      expect(Object.isFrozen(input.defaultScopes)).toBe(true);
    });

    await expect(
      resolveServerLoginScopes({
        requestedScopes: ["transition:generic"],
        configuredScopes: ["atproto", "transition:generic", "transition:email"],
        defaultScopes: ["transition:email"],
        atprotoId: TEST_ACCOUNT_HANDLE,
        resolveScopes: voidResolveScopes,
      }),
    ).resolves.toEqual(["atproto", "transition:generic"]);

    const nullResolveScopes = vi.fn(() => null);

    await expect(
      resolveServerLoginScopes({
        requestedScopes: ["transition:generic"],
        configuredScopes: ["atproto", "transition:generic"],
        defaultScopes: ["transition:generic"],
        atprotoId: TEST_ACCOUNT_HANDLE,
        resolveScopes: nullResolveScopes,
      }),
    ).resolves.toEqual(["atproto", "transition:generic"]);
  });
});
