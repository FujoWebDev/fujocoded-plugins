import { describe, expect, test } from "vitest";
import { remark } from "remark";
import { VFile } from "vfile";
import remarkCapitalizeTitles from "../src/index.ts";

const processAstroFrontmatterTitle = async (
  title: unknown,
  options?: Parameters<typeof remarkCapitalizeTitles>[0],
) => {
  const file = new VFile({
    value: "# lowercase body heading",
    data: { astro: { frontmatter: { title } } },
  });
  const result = await remark()
    .use(remarkCapitalizeTitles, options)
    .process(file);
  return (result.data.astro as { frontmatter: Record<string, unknown> })
    .frontmatter.title;
};

describe("Handles Astro frontmatter titles", () => {
  test("capitalizes frontmatter title by default", async () => {
    await expect(
      processAstroFrontmatterTitle(
        "checking title capitalization with npm and nodejs",
      ),
    ).resolves.toBe("Checking Title Capitalization with NPM and NodeJS");
  });

  test("can leave frontmatter titles untouched", async () => {
    await expect(
      processAstroFrontmatterTitle(
        "checking title capitalization with npm and nodejs",
        { frontmatterTitle: false },
      ),
    ).resolves.toBe("checking title capitalization with npm and nodejs");
  });

  test("ignores non-string frontmatter title values", async () => {
    await expect(processAstroFrontmatterTitle(42)).resolves.toBe(42);
  });
});
