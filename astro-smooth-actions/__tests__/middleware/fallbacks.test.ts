import { describe, expect, it, vi } from "vitest";

import type { SerializedActionResult } from "astro/actions/runtime/shared.js";
import {
  createContext,
  createFormAction,
  createMemorySession,
  runMiddleware,
  runFormActionPost,
  setActionContext,
} from "../helpers.ts";

describe("astro-smooth-actions middleware fallbacks", () => {
  it("passes through requests that are not form action calls", async () => {
    const session = createMemorySession();
    const request = new Request("https://app.fujocoded.test/landing");
    const { context, next } = createContext({
      request,
      session,
    });

    setActionContext({ context, value: {} });

    await runMiddleware(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(session.get).not.toHaveBeenCalled();
  });

  it("continues with native flow when no session is available", async () => {
    const request = new Request("https://app.fujocoded.test/subscribe", {
      method: "POST",
      headers: {
        Referer: "https://app.fujocoded.test/subscribe",
      },
      body: new FormData(),
    });
    const { context, next } = createContext({
      request,
      session: undefined,
      originPathname: "/subscribe",
    });
    const action = createFormAction({
      handler: vi.fn(async () => ({ ok: true })),
    });

    setActionContext({
      context,
      value: {
        action,
        serializeActionResult: (value: unknown) =>
          value as SerializedActionResult,
      },
    });
    await runMiddleware(context, next);

    expect(action.handler).not.toHaveBeenCalled();
    expect(context.cookies.get("astro-smooth-action-session")).toBeUndefined();
    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls next for prerendered requests without touching session/action handling", async () => {
    const session = createMemorySession({
      "smooth-actions:existing-token": {
        name: "actions.subscribe",
        result: { ok: true } as unknown as SerializedActionResult,
      },
    });
    const request = new Request("https://app.fujocoded.test/subscription");
    const { context, next, cookies } = createContext({
      request,
      session,
      isPrerendered: true,
      originPathname: "/subscription",
    });
    const action = createFormAction({
      handler: vi.fn(async () => ({ ok: true })),
    });

    setActionContext({ context, value: { action } });

    await runMiddleware(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(session.get).not.toHaveBeenCalled();
    expect(session.set).not.toHaveBeenCalled();
    expect(session.delete).not.toHaveBeenCalled();
    expect(cookies.values.size).toBe(0);
    expect(context.redirect).not.toHaveBeenCalled();
    expect(action.handler).not.toHaveBeenCalled();
  });

  it("falls back to next when session write fails and does not redirect", async () => {
    const session = createMemorySession();
    vi.mocked(session.set).mockImplementation(() => {
      throw new Error("session write failed");
    });
    const formData = new FormData();
    formData.set("email", "bobatan@fujocoded.test");
    const handler = vi.fn(async () => ({ ok: true }));
    const { context, next, cookies } = await runFormActionPost({
      formData,
      session,
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(context.redirect).not.toHaveBeenCalled();
    expect(session.delete).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(cookies.values.get("astro-smooth-action-session")).toBeUndefined();
  });

  it("continues with native flow when Astro action helpers are unavailable", async () => {
    const session = createMemorySession();
    const request = new Request("https://app.fujocoded.test/subscribe", {
      method: "POST",
      body: new FormData(),
    });
    const { context, next } = createContext({
      request,
      session,
      originPathname: "/subscribe",
    });
    const action = createFormAction({
      handler: vi.fn(async () => ({ ok: true })),
    });

    setActionContext({
      context,
      value: {
        action,
        setActionResult: undefined,
        serializeActionResult: undefined,
      } as Parameters<typeof setActionContext>[0]["value"],
    });

    await runMiddleware(context, next);

    expect(action.handler).not.toHaveBeenCalled();
    expect(session.set).not.toHaveBeenCalled();
    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("falls back to origin path when referer is malformed", async () => {
    const formData = new FormData();
    formData.set("handle", "bad-user");
    const { context, next } = await runFormActionPost({
      formData,
      headers: { Referer: "not-a-valid-url" },
      result: { error: { message: "invalid" } },
    });

    expect(context.redirect).toHaveBeenCalledWith("/subscribe");
    expect(next).not.toHaveBeenCalled();
  });

  it("falls back to origin pathname for cross-origin error referers", async () => {
    const formData = new FormData();
    formData.set("handle", "bad-user");
    const { context, next } = await runFormActionPost({
      formData,
      headers: {
        Referer: "https://attacker.example/profile?from=evil#oops",
      },
      result: { error: { message: "invalid" } },
    });

    expect(context.redirect).toHaveBeenCalledWith("/subscribe");
    expect(context.redirect).not.toHaveBeenCalledWith(
      "https://attacker.example/profile?from=evil#oops",
    );
    expect(next).not.toHaveBeenCalled();
  });
});
