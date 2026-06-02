import { describe, expect, test } from "vitest";

import {
  account,
  blob,
  identity,
  include,
  permissionScopes,
  repo,
  rpc,
} from "../src/lib/permissions.ts";

describe("permission scope helpers", () => {
  test("builds repo scopes for one or many record lexicons", () => {
    expect(repo("test.fujocoded.profile")).toBe("repo:test.fujocoded.profile");
    expect(
      repo("test.fujocoded.profile", {
        action: ["create", "update", "delete"],
      }),
    ).toBe(
      "repo:test.fujocoded.profile?action=create&action=update&action=delete",
    );
    expect(repo(["test.fujocoded.profile", "test.fujocoded.post"])).toBe(
      "repo?collection=test.fujocoded.profile&collection=test.fujocoded.post",
    );
  });

  test("builds rpc scopes for service method lexicons", () => {
    expect(rpc("test.fujocoded.moderation.createReport", { aud: "*" })).toBe(
      "rpc:test.fujocoded.moderation.createReport?aud=*",
    );
    expect(rpc("*", { aud: "did:web:api.fujocoded.test#svc_appview" })).toBe(
      "rpc:*?aud=did%3Aweb%3Aapi.fujocoded.test%23svc_appview",
    );
    expect(
      rpc(["test.fujocoded.getFeed", "test.fujocoded.getProfile"], {
        aud: "did:web:api.fujocoded.test#svc_appview",
      }),
    ).toBe(
      "rpc?lxm=test.fujocoded.getFeed&lxm=test.fujocoded.getProfile&aud=did%3Aweb%3Aapi.fujocoded.test%23svc_appview",
    );
  });

  test("builds direct blob, account, identity, and include scopes", () => {
    expect(blob("*/*")).toBe("blob:*%2F*");
    expect(blob(["video/*", "text/html"])).toBe(
      "blob?accept=video%2F*&accept=text%2Fhtml",
    );
    expect(account("email")).toBe("account:email");
    expect(account("repo", { action: "manage" })).toBe(
      "account:repo?action=manage",
    );
    expect(identity("handle")).toBe("identity:handle");
    expect(include("test.fujocoded.authBasicFeatures")).toBe(
      "include:test.fujocoded.authBasicFeatures",
    );
    expect(
      include("test.fujocoded.authBasicFeatures", {
        aud: "did:web:api.fujocoded.test#svc_appview",
      }),
    ).toBe(
      "include:test.fujocoded.authBasicFeatures?aud=did%3Aweb%3Aapi.fujocoded.test%23svc_appview",
    );
  });

  test("collects optional scopes without duplicates", () => {
    expect(
      permissionScopes([
        repo("test.fujocoded.profile"),
        false,
        null,
        undefined,
        repo("test.fujocoded.profile"),
        blob("*/*"),
      ]),
    ).toEqual(["repo:test.fujocoded.profile", "blob:*%2F*"]);
  });

  test("rejects unsupported wildcard shapes", () => {
    expect(() => repo("test.fujocoded.*")).toThrow(
      "repo permission collection does not support partial wildcards",
    );
    expect(() => rpc("test.fujocoded.*", { aud: "*" })).toThrow(
      "rpc permission lxm does not support partial wildcards",
    );
    expect(() => rpc("*", { aud: "*" })).toThrow(
      'rpc permission cannot use both lxm="*" and aud="*".',
    );
  });
});
