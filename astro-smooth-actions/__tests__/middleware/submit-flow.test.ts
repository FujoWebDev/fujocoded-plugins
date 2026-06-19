import { describe, expect, it, vi } from "vitest";

import type { SerializedActionResult } from "astro/actions/runtime/shared.js";
import {
  getStoredActionEntry,
  getStoredActionInput,
  runFormActionPost,
} from "../helpers.ts";

describe("astro-smooth-actions middleware PRG flow", () => {
  it("persists form action results and redirects to origin on success", async () => {
    const formData = new FormData();
    const file = new File(["payload"], "avatar.txt", { type: "text/plain" });
    formData.set("email", "bobatan@fujocoded.test");
    formData.set("avatar", file);
    const actionResult = { ok: true, email: "bobatan@fujocoded.test" };
    const { action, context, next, cookies, session } = await runFormActionPost(
      {
        formData,
        result: actionResult,
      },
    );

    const sessionKey = cookies.values.get("astro-smooth-action-session");
    expect(sessionKey).toBeTruthy();
    expect(context.request.method).toBe("POST");
    expect(action.handler).toHaveBeenCalledTimes(1);
    expect(context.redirect).toHaveBeenCalledWith("/subscribe");
    expect(next).not.toHaveBeenCalled();
    expect(cookies.setOptions.get("astro-smooth-action-session")).toEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60,
    });
    expect(session.set).toHaveBeenCalledTimes(1);
    const [storedKey, storedEntry] = vi.mocked(session.set).mock.calls[0]!;

    expect(storedKey).toBe(`smooth-actions:${sessionKey}`);
    expect(storedEntry).toEqual({
      name: "actions.subscribe",
      result: actionResult,
      input: { email: "bobatan@fujocoded.test", avatar: null },
    });
    expect(session.delete).not.toHaveBeenCalled();
  });

  it("stores serialized action results instead of raw handler values", async () => {
    const rawResult = { ok: true, value: new Date("2026-01-01T00:00:00.000Z") };
    const serializedResult = {
      ok: true,
      value: "2026-01-01T00:00:00.000Z",
    } as unknown as SerializedActionResult;
    const serializeActionResult = vi.fn(() => serializedResult);
    const { context, next, cookies, session } = await runFormActionPost({
      result: rawResult,
      serializeActionResult,
    });

    expect(serializeActionResult).toHaveBeenCalledWith(rawResult);
    expect(getStoredActionInput({ session, cookies })).toBeUndefined();
    const storedEntry = getStoredActionEntry(session);
    expect(storedEntry).toEqual({
      name: "actions.subscribe",
      result: serializedResult,
      input: undefined,
    });
    expect(storedEntry).not.toEqual(
      expect.objectContaining({ result: rawResult }),
    );
    expect(context.redirect).toHaveBeenCalledWith("/subscribe");
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects form errors to the same-origin referer", async () => {
    const formData = new FormData();
    formData.set("handle", "bad-user");
    const { context, next } = await runFormActionPost({
      formData,
      headers: {
        Referer: "https://app.fujocoded.test/profile?page=1#errors",
      },
      result: { error: { message: "invalid" } },
    });

    expect(context.redirect).toHaveBeenCalledWith("/profile?page=1#errors");
    expect(next).not.toHaveBeenCalled();
  });
});
