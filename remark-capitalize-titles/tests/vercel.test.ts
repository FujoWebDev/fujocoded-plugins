import { describe, expect, test } from "vitest";
import { remark } from "remark";
import type { Compatible } from "vfile";
import remarkCapitalizeTitles from "../index.ts";

const processMarkdown = async (value: Compatible) => {
  const file = await remark().use(remarkCapitalizeTitles).process(value);
  return file.toString().slice(0, -1);
};


// Test cases lifted verbatim from the upstream `title` package's own suite
// (vercel/title, test/index.test.js) so we can see exactly how our wrapper
// diverges from `title`'s standalone behavior. Some expected outputs have
// been adapted where our wrapper intentionally differs (e.g.
// `lowercaseHyphenatedTails` lowercases the second part of a hyphenated
// compound, so `Log-In` becomes `Log-in`).
describe("Imported from `title` package's test suite", () => {
  const processWith = async (value: string, special: string[]) => {
    const file = await remark()
      .use(remarkCapitalizeTitles, { special, componentNames: [] })
      .process(value);
    return file.toString().slice(0, -1);
  };

  test("capitalizes the first letter of relevant words", async () => {
    expect(await processMarkdown("# capitalize your titles")).toBe(
      "# Capitalize Your Titles",
    );
  });

  test("lowercases letters in addition to capitalizing them", async () => {
    expect(
      await processMarkdown("# updates TO hAndLinG of Failed paYMEnts"),
    ).toBe("# Updates to Handling of Failed Payments");
  });

  test("handles titles with special characters", async () => {
    expect(
      await processMarkdown(
        "# seattle’S BEST coffee & grandma's cookies",
      ),
    ).toBe("# Seattle’s Best Coffee & Grandma's Cookies");
  });

  test("understands Vercel product names (with explicit specials)", async () => {
    expect(
      await processWith("# noW deSktop and now cLI are prODUCts of zeIt", [
        "CLI",
        "ZEIT",
      ]),
    ).toBe("# Now Desktop and Now CLI Are Products of ZEIT");
  });

  test("handles Vercel product names with other special characters", async () => {
    expect(
      await processWith(
        "# aPi 2.0: lOG-in with zeit, new dOCs & more",
        ["API", "ZEIT"],
      ),
      // NOTE: upstream `title` produces "Log-In"; our wrapper applies
      // AP-style hyphenated-tail lowercasing, so we expect "Log-in".
    ).toBe("# API 2.0: Log-in with ZEIT, New Docs & More");

    expect(
      await processWith(
        "# toWArds NEXT.JS 5: Introducing cANaRY Updates",
        ["Next.js"],
      ),
    ).toBe("# Towards Next.js 5: Introducing Canary Updates");
  });

  test("modifies custom special words", async () => {
    expect(
      await processWith("# mY cusToM brand is awesome", ["BRAnD", "awesoMe"]),
    ).toBe("# My Custom BRAnD Is awesoMe");

    expect(
      await processWith("# modify speCials like Facebook or microsoft", [
        "facebook",
        "Microsoft",
      ]),
    ).toBe("# Modify Specials like facebook or Microsoft");
  });

  test("capitalizes the last word regardless of syntax", async () => {
    expect(await processMarkdown("# there and beyond")).toBe(
      "# There and Beyond",
    );

    expect(await processMarkdown("# be careful what you wish for")).toBe(
      "# Be Careful What You Wish For",
    );

    expect(
      await processWith("# XYZ: what is it good for", ["XYZ"]),
    ).toBe("# XYZ: What Is It Good For");
  });

  test("supports international characters", async () => {
    expect(await processMarkdown("# çeşme city")).toBe("# Çeşme City");
    expect(await processMarkdown("# la niña esta aquí")).toBe(
      "# La Niña Esta Aquí",
    );
    expect(await processMarkdown("# forhandlingsmøde")).toBe(
      "# Forhandlingsmøde",
    );
    expect(await processMarkdown("# đội")).toBe("# Đội");
    expect(await processMarkdown("# tuyển")).toBe("# Tuyển");
  });
});
