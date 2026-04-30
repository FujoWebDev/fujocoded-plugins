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

  test("handles an inner ellipsis with no trailing space", async () => {
    expect(
      await processMarkdown("### check it out before you...check it out!"),
    ).toBe("### Check It Out before You...Check It Out!");
  });

  test("treats inner ellipsis as transparent for small words", async () => {
    expect(await processMarkdown("# wait...and then more")).toBe(
      "# Wait...and Then More",
    );
    expect(await processMarkdown("# stop...but think first")).toBe(
      "# Stop...but Think First",
    );
  });

  // Parens are transparent: title-case as if they weren't there. So small
  // words after `)` stay lowercase, content words get capped, and a letter
  // inside `(...)` is cased like the rest of its word.
  test("treats parens as transparent for title-casing", async () => {
    expect(
      await processMarkdown("### traveling through (your code's) history"),
    ).toBe("### Traveling Through (Your Code's) History");

    expect(
      await processMarkdown("# employment region(s) for my application"),
    ).toBe("# Employment Region(s) for My Application");

    expect(await processMarkdown("# (s)omething or other")).toBe(
      "# (S)omething or Other",
    );

    expect(await processMarkdown("# cat(s) can be a pain")).toBe(
      "# Cat(s) Can Be a Pain",
    );

    expect(await processMarkdown("# (s)omethin(g)")).toBe("# (S)omethin(g)");
  });
});

describe("Handles markdown inline delimiters", () => {
  test("capitalizes a strikethrough leading word", async () => {
    expect(
      await processMarkdown("### ~~don't~~ forget your github addresses!"),
    ).toBe("### ~~Don't~~ Forget Your GitHub Addresses!");
  });

  test("capitalizes a bold-wrapped word mid-title", async () => {
    expect(
      await processMarkdown("## the **only** thing you'll ever need"),
    ).toBe("## The **Only** Thing You'll Ever Need");
  });

  // remark's stringifier normalizes `_em_` to `*em*`; the leading-letter
  // capitalization is what matters here.
  test("capitalizes an underscore-emphasized leading word", async () => {
    expect(await processMarkdown("# _really_ important changes")).toBe(
      "# *Really* Important Changes",
    );
  });

  test("capitalizes an asterisk-emphasized word", async () => {
    expect(await processMarkdown("## a *very* good idea")).toBe(
      "## A *Very* Good Idea",
    );
  });

  test("capitalizes a word adjacent to an em dash", async () => {
    expect(await processMarkdown("## merging—your final boss")).toBe(
      "## Merging—Your Final Boss",
    );
  });

  test("capitalizes a word adjacent to an en dash", async () => {
    expect(await processMarkdown("## merging–your final boss")).toBe(
      "## Merging–Your Final Boss",
    );
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
    expect(await processMarkdown("## git & github's `push`/`pull` dance")).toBe(
      "## Git & GitHub's `push`/`pull` Dance",
    );
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
    expect(await processMarkdown("## push/pull: git's memory-sync dance")).toBe(
      "## Push/pull: Git's Memory-sync Dance",
    );
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
