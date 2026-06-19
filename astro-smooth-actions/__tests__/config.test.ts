import { describe, expect, it } from "vitest";

import { DEFAULT_EXCLUDED_FIELDS, normalizeConfig } from "../src/config.ts";

describe("normalizeConfig", () => {
  it("uses the built-in defaults when excludeFields is omitted", () => {
    expect(normalizeConfig().input.excludeFields).toEqual([
      ...DEFAULT_EXCLUDED_FIELDS,
    ]);
  });

  it("replaces the defaults with the caller's list when excludeFields is set", () => {
    expect(
      normalizeConfig({
        input: {
          excludeFields: ["backupEmail", "inviteCode"],
        },
      }).input.excludeFields,
    ).toEqual(["backupEmail", "inviteCode"]);
  });
});
