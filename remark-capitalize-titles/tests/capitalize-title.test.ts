import { describe, expect, test } from "vitest";
import { capitalizeTitle } from "../src/index.ts";

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

  test("treats a suffix attached to a code span as a continuation", () => {
    expect(capitalizeTitle("the `head`ing story")).toBe(
      "The `head`ing Story",
    );
  });

  test("does not treat text after a leading code span as the title start", () => {
    expect(capitalizeTitle("`foo` and bar")).toBe("`foo` and Bar");
  });

  // The string path re-cases the original source bytes, so emphasis delimiters
  // and backslash escapes are preserved verbatim (no `_em_` → `*em*`).
  test("preserves emphasis delimiters and escapes without normalizing", () => {
    expect(capitalizeTitle("a _really_ big \\* moment")).toBe(
      "A _Really_ Big \\* Moment",
    );
  });

  // A title can start with block-markdown punctuation; fromMarkdown parses it
  // as a heading/list/blockquote, but the enclosing block is transparent, so
  // the leading marker is preserved and the inline text (including code spans)
  // is cased exactly as in a plain title.
  test("preserves a leading heading marker and respects code spans", () => {
    expect(capitalizeTitle("# the `git` thing")).toBe("# The `git` Thing");
  });

  test("preserves a leading blockquote marker", () => {
    expect(capitalizeTitle("> push and pull")).toBe("> Push and Pull");
  });
});
