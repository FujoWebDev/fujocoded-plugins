import { describe, expect, test } from "vitest";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import remarkCapitalizeTitles from "../src/index.ts";

const processComponent = async (
  value: string,
  componentNames: string[] = ["Callout"],
) => {
  const file = await remark()
    .use(remarkMdx)
    .use(remarkCapitalizeTitles, { componentNames })
    .process(value);
  return file.toString().slice(0, -1);
};

describe("Capitalizes named component titles", () => {
  test("title-cases a plain component title", async () => {
    expect(
      await processComponent('<Callout title="merging with github via npm" />'),
    ).toBe('<Callout title="Merging with GitHub via NPM" />');
  });

  test("preserves an inline code span inside a component title", async () => {
    expect(
      await processComponent(
        '<Callout title="the flavors of `git reset`: soft, hard, or mixed" />',
      ),
    ).toBe(
      '<Callout title="The Flavors of `git reset`: Soft, Hard, or Mixed" />',
    );
  });

  test("ignores components not in the list", async () => {
    expect(await processComponent('<Other title="leave this alone" />')).toBe(
      '<Other title="leave this alone" />',
    );
  });
});
