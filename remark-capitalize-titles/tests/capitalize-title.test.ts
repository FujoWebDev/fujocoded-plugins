import { describe, expect, test } from "vitest";
import { capitalizeTitle } from "../index.ts";

describe("capitalizeTitle as standalone function export", () => {
  test("title-cases a standalone string", () => {
    expect(capitalizeTitle("cloning: not just for mad scientists")).toBe(
      "Cloning: Not Just for Mad Scientists",
    );
  });

  test("applies the default capitalization exceptions", () => {
    expect(capitalizeTitle("merging with github via npm and nodejs")).toBe(
      "Merging with GitHub via NPM and NodeJS",
    );
  });

  test("accepts a custom special list", () => {
    expect(
      capitalizeTitle("mY cusToM brand is awesome", {
        special: ["BRAnD", "awesoMe"],
      }),
    ).toBe("My Custom BRAnD Is awesoMe");
  });

  test("caps the first and last word", () => {
    expect(capitalizeTitle("there and beyond")).toBe("There and Beyond");
  });

  test("leaves inline code spans untouched", () => {
    expect(capitalizeTitle("the flavors of `git reset`: soft or hard")).toBe(
      "The Flavors of `git reset`: Soft or Hard",
    );
  });
});
