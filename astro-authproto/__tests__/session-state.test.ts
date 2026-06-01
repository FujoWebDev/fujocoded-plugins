import { describe, expect, test } from "vitest";

import {
  AUTHPROTO_DID,
  AUTHPROTO_ERROR_CODE,
  AUTHPROTO_ERROR_DESCRIPTION,
  AUTHPROTO_ERROR_URI,
  AUTHPROTO_SCOPES,
  clearSessionGrant,
  persistAuthprotoError,
  persistLoginGrant,
  readAndClearAuthprotoError,
  readSessionGrant,
} from "../src/lib/session-state.ts";
import { createSession } from "./support/session.ts";

describe("session state", () => {
  test("persists and clears login grants", async () => {
    const session = createSession();

    await persistLoginGrant(session, {
      did: "did:plc:b0b474nD1d",
      scopes: ["atproto", "transition:generic"],
    });

    await expect(readSessionGrant(session)).resolves.toEqual({
      did: "did:plc:b0b474nD1d",
      scopes: ["atproto", "transition:generic"],
    });

    expect(await session.get(AUTHPROTO_SCOPES)).toEqual([
      "atproto",
      "transition:generic",
    ]);

    await clearSessionGrant(session);
    await expect(readSessionGrant(session)).resolves.toEqual({
      did: undefined,
      scopes: [],
    });
    expect(await session.get(AUTHPROTO_DID)).toBeUndefined();
    expect(await session.get(AUTHPROTO_SCOPES)).toBeUndefined();
  });

  test("does not store non-string scope values in login grants", async () => {
    const session = createSession();

    await persistLoginGrant(session, {
      did: "did:plc:b0b474nD1d",
      scopes: ["atproto", 123, "transition:generic"],
    });

    expect(await session.get(AUTHPROTO_SCOPES)).toEqual([
      "atproto",
      "transition:generic",
    ]);
    await expect(readSessionGrant(session)).resolves.toEqual({
      did: "did:plc:b0b474nD1d",
      scopes: ["atproto", "transition:generic"],
    });
  });

  test("drops non-string scope values left in session storage", async () => {
    const session = createSession({
      [AUTHPROTO_DID]: "did:plc:b0b474nD1d",
      // Existing session storage may already contain invalid scope values.
      [AUTHPROTO_SCOPES]: ["atproto", 123, "transition:generic"],
    });

    await expect(readSessionGrant(session)).resolves.toEqual({
      did: "did:plc:b0b474nD1d",
      scopes: ["atproto", "transition:generic"],
    });
  });

  test("reads and clears auth errors for locals input", async () => {
    const session = createSession();

    await persistAuthprotoError(session, {
      code: "lexError",
      description: "Lexicon validation failed",
      uri: "https://auth.fujocoded.test/errors/lexError",
    });

    await expect(readAndClearAuthprotoError(session)).resolves.toEqual({
      code: "lexError",
      description: "Lexicon validation failed",
      uri: "https://auth.fujocoded.test/errors/lexError",
    });
    await expect(readAndClearAuthprotoError(session)).resolves.toBeNull();
    expect(await session.get(AUTHPROTO_ERROR_CODE)).toBeUndefined();
    expect(await session.get(AUTHPROTO_ERROR_DESCRIPTION)).toBeUndefined();
    expect(await session.get(AUTHPROTO_ERROR_URI)).toBeUndefined();
  });
});
