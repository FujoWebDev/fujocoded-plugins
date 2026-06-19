import { describe, expect, it } from "vitest";

import { ACTION_INPUT_CONTROL, ACTION_INPUT_NONE } from "../../src/controls.ts";
import {
  addExcludedFields,
  getStoredActionInput,
  runFormActionPost,
  setExcludedActions,
} from "../helpers.ts";

describe("astro-smooth-actions input storage", () => {
  it("keeps string fields, repeated values, and marks file fields as hidden", async () => {
    const longValue = "a".repeat(600);
    const formData = new FormData();
    formData.set("first", longValue);
    formData.set("second", "value2");
    formData.set("third", "value3");
    formData.set("fourth", "value4");
    formData.set("fifth", "value5");
    formData.set("sixth", "value6");
    formData.set("seventh", "value7");
    formData.set("eighth", "value8");
    formData.set("ninth", "value9");
    formData.set("tenth", "value10");
    formData.append("tag", "alpha");
    formData.append("tag", "beta");
    formData.append(
      "avatar",
      new File(["x"], "avatar.txt", { type: "text/plain" }),
    );
    const { context, next, cookies, session } = await runFormActionPost({
      formData,
    });

    expect(context.redirect).toHaveBeenCalledWith("/subscribe");
    expect(next).not.toHaveBeenCalled();
    expect(getStoredActionInput({ session, cookies })).toEqual({
      first: longValue,
      second: "value2",
      third: "value3",
      fourth: "value4",
      fifth: "value5",
      sixth: "value6",
      seventh: "value7",
      eighth: "value8",
      ninth: "value9",
      tenth: "value10",
      tag: ["alpha", "beta"],
      avatar: null,
    });
  });

  it("keeps string fields from form errors", async () => {
    const formData = new FormData();
    formData.set("handle", "bad-user");
    formData.append("avatar", new File(["x"], "a.txt"));
    const { cookies, session } = await runFormActionPost({
      formData,
      headers: {
        Referer: "https://app.fujocoded.test/profile?page=1#errors",
      },
      result: { error: { message: "invalid" } },
    });

    expect(getStoredActionInput({ session, cookies })).toEqual({
      handle: "bad-user",
      avatar: null,
    });
  });

  it("does not store sensitive field names by default", async () => {
    const formData = new FormData();
    formData.set("email", "bobatan@fujocoded.test");
    formData.set("password", "super-secret");
    formData.set("currentPassword", "old-secret");
    formData.set("csrf_token", "token-value");
    formData.set("otp", "123456");
    formData.set("shipping", "123 Example Street");
    const { cookies, session } = await runFormActionPost({
      url: "https://app.fujocoded.test/login",
      originPathname: "/login",
      formData,
    });

    expect(getStoredActionInput({ session, cookies })).toEqual({
      email: "bobatan@fujocoded.test",
      password: null,
      currentPassword: null,
      csrf_token: null,
      otp: null,
      shipping: "123 Example Street",
    });
  });

  it("does not store explicitly omitted fields or policy controls", async () => {
    const formData = new FormData();
    formData.set("email", "bobatan@fujocoded.test");
    formData.set("nickname", "Fujo");
    formData.set("apiKey", "key-value");
    formData.append(ACTION_INPUT_CONTROL, "email");
    formData.append(ACTION_INPUT_CONTROL, "nickname, missing");
    const { cookies, session } = await runFormActionPost({
      url: "https://app.fujocoded.test/profile",
      originPathname: "/profile",
      formData,
    });

    expect(getStoredActionInput({ session, cookies })).toEqual({
      email: null,
      nickname: null,
      apiKey: null,
    });
  });

  it("does not store configured excluded field names", async () => {
    addExcludedFields(["backupEmail", "invite-code"]);
    const formData = new FormData();
    formData.set("displayName", "Fujo");
    formData.set("backup-email", "backup@fujocoded.test");
    formData.set("inviteCode", "invite-value");
    formData.set("userInviteCode", "not-excluded");
    const { cookies, session } = await runFormActionPost({
      url: "https://app.fujocoded.test/profile",
      originPathname: "/profile",
      formData,
    });

    expect(getStoredActionInput({ session, cookies })).toEqual({
      displayName: "Fujo",
      "backup-email": null,
      inviteCode: null,
      userInviteCode: "not-excluded",
    });
  });

  it("can disable input storage for a whole form with a sentinel value", async () => {
    const formData = new FormData();
    formData.set("email", "bobatan@fujocoded.test");
    formData.set("handle", "user");
    formData.set(ACTION_INPUT_CONTROL, ACTION_INPUT_NONE);
    const { cookies, session } = await runFormActionPost({
      url: "https://app.fujocoded.test/account",
      originPathname: "/account",
      formData,
    });

    expect(getStoredActionInput({ session, cookies })).toBeUndefined();
  });

  it("only treats none as the whole-form input storage sentinel", async () => {
    const formData = new FormData();
    formData.set("email", "bobatan@fujocoded.test");
    formData.set("off", "field-value");
    formData.set("false", "field-value");
    formData.set(ACTION_INPUT_CONTROL, "off, false");
    const { cookies, session } = await runFormActionPost({
      url: "https://app.fujocoded.test/account",
      originPathname: "/account",
      formData,
    });

    expect(getStoredActionInput({ session, cookies })).toEqual({
      email: "bobatan@fujocoded.test",
      off: null,
      false: null,
    });
  });

  it("can disable input storage for a configured action name", async () => {
    setExcludedActions(["login"]);
    const formData = new FormData();
    formData.set("email", "bobatan@fujocoded.test");
    formData.set("handle", "user");
    const { context, next, cookies, session } = await runFormActionPost({
      url: "https://app.fujocoded.test/login",
      originPathname: "/login",
      actionName: "actions.login",
      formData,
    });

    expect(context.redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
    expect(getStoredActionInput({ session, cookies })).toBeUndefined();
  });
});
