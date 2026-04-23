import { describe, expect, test } from "vitest";
import { remark } from "remark";
import type { Compatible } from "vfile";
import remarkCapitalizeTitles from "../index.ts";

const processMarkdown = async (value: Compatible) => {
  const file = await remark().use(remarkCapitalizeTitles).process(value);
  return file.toString().slice(0, -1);
};

describe("Handles the basics", () => {
  test("title-cases a simple heading", async () => {
    expect(
      await processMarkdown("# cloning: not just for mad scientists"),
    ).toBe("# Cloning: Not Just for Mad Scientists");
  });

  test("leaves non-heading text untouched", async () => {
    expect(
      await processMarkdown(
        "git mindwiped: fully discarding changes\n\n# git mindwiped: fully discarding changes",
      ),
    ).toBe(
      "git mindwiped: fully discarding changes\n\n# Git Mindwiped: Fully Discarding Changes",
    );
  });
});

describe("Preserves special cases", () => {
  test("preserves GitHub, FujoCoded, LLC, and NPM", async () => {
    expect(
      await processMarkdown(
        "## merging with github's interface: pull requests",
      ),
    ).toBe("## Merging with GitHub's Interface: Pull Requests");
    expect(await processMarkdown("### an intro to fujocoded llc")).toBe(
      "### An Intro to FujoCoded LLC",
    );
    expect(await processMarkdown("## next up: building with npm")).toBe(
      "## Next Up: Building with NPM",
    );
  });

  test("preserves SHA", async () => {
    expect(await processMarkdown("#### sha: your commit's unique name")).toBe(
      "#### SHA: Your Commit's Unique Name",
    );
  });

  test("preserves TL;DR", async () => {
    expect(await processMarkdown("# tl;dr: why this matters")).toBe(
      "# TL;DR: Why This Matters",
    );
  });
});

describe("Respects tricky punctuations", () => {
  test("handles curly quotes (as produced by smartypants)", async () => {
    expect(
      await processMarkdown(
        "#### “answer me, darling~”: git & github’s connection check!",
      ),
    ).toBe("#### “Answer Me, Darling~”: Git & GitHub’s Connection Check!");
  });

  test("handles apostrophes inside a word", async () => {
    expect(
      await processMarkdown("## git'ing good: more commit scenarios"),
    ).toBe("## Git'ing Good: More Commit Scenarios");
  });

  test("handles a trailing question mark with an inner apostrophe", async () => {
    expect(await processMarkdown("## i'm ready to practice, now what?")).toBe(
      "## I'm Ready to Practice, Now What?",
    );
  });

  test("handles repeated punctuation (???)", async () => {
    expect(await processMarkdown("### step ???: git advanced")).toBe(
      "### Step ???: Git Advanced",
    );
  });

  test("handles a leading ellipsis", async () => {
    expect(await processMarkdown("### ...and more!")).toBe("### ...and More!");
  });

  test("handles parenthesized possessives", async () => {
    expect(
      await processMarkdown("### traveling through (your code's) history"),
    ).toBe("### Traveling Through (Your Code's) History");
  });
});

describe("Handles inline code spans", () => {
  test("handles an inline code span inside a heading", async () => {
    expect(
      await processMarkdown(
        "### the flavors of `git reset`: soft, hard, or mixed",
      ),
    ).toBe("### The Flavors of `git reset`: Soft, Hard, or Mixed");
  });

  test("handles multiple inline code spans with separators", async () => {
    expect(
      await processMarkdown("## git & github's `push`/`pull` dance"),
    ).toBe("## Git & GitHub's `push`/`pull` Dance");
  });

  test("handles punctuation immediately following an inline code span", async () => {
    expect(
      await processMarkdown("## multiverse collapse: prepare to `merge`!"),
    ).toBe("## Multiverse Collapse: Prepare to `merge`!");
  });

  test("handles a comma-separated list of inline code spans with a hyphenated term", async () => {
    expect(
      await processMarkdown(
        "#### the jokes write themselves: `ours`, `theirs`, and three-way merges",
      ),
    ).toBe(
      "#### The Jokes Write Themselves: `ours`, `theirs`, and Three-way Merges",
    );
  });
});

describe("Handles hyphenated compound words", () => {
  test("keeps the second word lowercase in a hyphenated name with a possessive", async () => {
    expect(
      await processMarkdown("### our toy project: boba-tan's sexyman shrine"),
    ).toBe("### Our Toy Project: Boba-tan's Sexyman Shrine");
  });

  test("handles hyphenated words alongside a slash separator", async () => {
    expect(
      await processMarkdown("## push/pull: git's memory-sync dance"),
    ).toBe("## Push/pull: Git's Memory-sync Dance");
  });

  test("handles common hyphenated prefixes", async () => {
    expect(
      await processMarkdown("### pre-commit hooks for post-merge cleanups"),
    ).toBe("### Pre-commit Hooks for Post-merge Cleanups");
  });

  test("handles hyphenated phrases with small words inside", async () => {
    expect(await processMarkdown("## up-to-date and ready-to-merge")).toBe(
      "## Up-to-date and Ready-to-merge",
    );
  });
});
