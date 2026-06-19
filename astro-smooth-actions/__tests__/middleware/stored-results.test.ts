import { describe, expect, it, vi } from "vitest";

import type { SerializedActionResult } from "astro/actions/runtime/shared.js";
import {
  createContext,
  createMemorySession,
  runMiddleware,
  setActionContext,
} from "../helpers.ts";

describe("astro-smooth-actions stored result restoration", () => {
  it("restores a stored form result on the redirect target and clears storage", async () => {
    const storedResult = { ok: true } as unknown as SerializedActionResult;
    const session = createMemorySession({
      "smooth-actions:existing-token": {
        name: "actions.subscribe",
        result: storedResult,
        input: { email: "bobatan@fujocoded.test" },
      },
    });

    const request = new Request("https://app.fujocoded.test/landing");
    const { context, next, cookies } = createContext({
      request,
      session,
    });
    cookies.set("astro-smooth-action-session", "existing-token");

    const setActionResult = vi.fn();
    setActionContext({ context, value: { setActionResult } });

    await runMiddleware(context, next);

    expect(setActionResult).toHaveBeenCalledWith(
      "actions.subscribe",
      storedResult,
    );
    expect(context.locals.lastAction).toEqual({
      name: "actions.subscribe",
      input: { email: "bobatan@fujocoded.test" },
    });
    expect(session.delete).toHaveBeenCalledWith(
      "smooth-actions:existing-token",
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(cookies.deleted).toContain("astro-smooth-action-session");
    expect(cookies.deleteOptions.get("astro-smooth-action-session")).toEqual({
      path: "/",
    });
  });

  it("restores a stored result without lastAction when input was not stored", async () => {
    const storedResult = { ok: true } as unknown as SerializedActionResult;
    const session = createMemorySession({
      "smooth-actions:existing-token": {
        name: "actions.login",
        result: storedResult,
      },
    });

    const request = new Request("https://app.fujocoded.test/login");
    const { context, next, cookies } = createContext({
      request,
      session,
    });
    cookies.set("astro-smooth-action-session", "existing-token");

    const setActionResult = vi.fn();
    setActionContext({ context, value: { setActionResult } });

    await runMiddleware(context, next);

    expect(setActionResult).toHaveBeenCalledWith("actions.login", storedResult);
    expect(context.locals.lastAction).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("handles stale session ids by clearing the session cookie", async () => {
    const session = createMemorySession();
    const request = new Request("https://app.fujocoded.test/landing");
    const { context, next, cookies } = createContext({
      request,
      session,
      originPathname: "/landing",
    });
    cookies.set("astro-smooth-action-session", "missing-token");

    setActionContext({ context, value: {} });

    await runMiddleware(context, next);

    expect(session.get).toHaveBeenCalledWith("smooth-actions:missing-token");
    expect(session.delete).toHaveBeenCalledWith("smooth-actions:missing-token");
    expect(cookies.deleted).toContain("astro-smooth-action-session");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("cleans up invalid stored session entries and continues with native flow", async () => {
    const session = createMemorySession({
      "smooth-actions:invalid-token": {
        name: 123,
        result: { ok: true },
      },
    });
    const request = new Request("https://app.fujocoded.test/landing");
    const { context, next, cookies } = createContext({
      request,
      session,
    });
    cookies.set("astro-smooth-action-session", "invalid-token");

    setActionContext({ context, value: {} });

    await runMiddleware(context, next);

    expect(session.get).toHaveBeenCalledWith("smooth-actions:invalid-token");
    expect(session.delete).toHaveBeenCalledWith("smooth-actions:invalid-token");
    expect(cookies.deleted).toContain("astro-smooth-action-session");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
