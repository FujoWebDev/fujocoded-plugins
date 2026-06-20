import { visit } from "unist-util-visit";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Plugin } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

import { DEFAULT_CAPITALIZATIONS } from "./capitalizations.ts";
import { collectTitleItemsFromChildren, titleCase } from "./title-case.ts";

// Title-case a standalone string (treated as a whole markdown title), handling
// inline code spans, emphasis, escapes, etc. The plugin uses this for
// frontmatter and component title props; it's exported for callers who want
// title-casing outside a remark plugin.
export const capitalizeTitle = (
  title: string,
  { special = DEFAULT_CAPITALIZATIONS }: { special?: string[] } = {},
): string => {
  const tree = fromMarkdown(title);
  const items = collectTitleItemsFromChildren(tree.children);

  // Re-case the original source bytes (via each text node's position offsets),
  // NOT node.value: value is unescaped (`a \* b` => `a * b`) while its position
  // spans the *escaped* source, so splicing value back would drop escapes and
  // shift later offsets. Since titleCase only flips letters and copies all other
  // characters through, escapes, `_`/`*` delimiters, and exact spacing survives.
  let result = "";
  let cursor = 0;
  items.forEach((item, i) => {
    if (item.type !== "text") return;
    const start = item.node.position!.start.offset!;
    const end = item.node.position!.end.offset!;
    result += title.slice(cursor, start);
    result += titleCase(title.slice(start, end), {
      special,
      isFirstTextNode: i === 0,
      isLastTextNode: i === items.length - 1,
      firstWordIsContinuation: item.firstWordIsContinuation,
    });
    cursor = end;
  });
  result += title.slice(cursor);
  return result;
};

type AstroFrontmatterData = {
  astro?: {
    frontmatter?: Record<string, unknown>;
  };
};

type PluginOptions = {
  special?: string[];
  componentNames?: string[];
  frontmatterTitle?: boolean;
};

const plugin: Plugin<[PluginOptions?], mdast.Root> =
  ({
    special = DEFAULT_CAPITALIZATIONS,
    componentNames = [],
    frontmatterTitle = true,
  } = {}) =>
  (tree, file) => {
    // If frontmatterTitle is true, it will also format the title in the
    // frontmatter, but only if Astro is exposing it.
    if (frontmatterTitle) {
      const frontmatter = (file.data as AstroFrontmatterData).astro
        ?.frontmatter;
      if (typeof frontmatter?.title === "string") {
        frontmatter.title = capitalizeTitle(frontmatter.title, { special });
      }
    }

    // Pass 1: every heading. A heading's text can be split across multiple
    // phrasing nodes (emphasis, links, inline code), so we flatten them into
    // ordered title items first — that tells us which text node is first/last
    // and which ones continue a preceding code span ("`head`ing"). Headings
    // mutate text nodes in place; the serializer re-emits them (and normalizes
    // the body, e.g. `_em_` → `*em*`, which is the expected heading behavior).
    visit(tree, "heading", (node) => {
      const items = collectTitleItemsFromChildren(node.children);
      items.forEach((item, i) => {
        if (item.type !== "text") return;
        item.node.value = titleCase(item.node.value, {
          special,
          isFirstTextNode: i === 0,
          isLastTextNode: i === items.length - 1,
          firstWordIsContinuation: item.firstWordIsContinuation,
        });
      });
    });
    if (componentNames.length === 0) {
      return;
    }
    // Pass 2: title props of the named MDX components. Their value is one raw
    // string, so capitalizeTitle parses and re-cases it (code spans, emphasis,
    // escapes and all) on its own.
    visit(
      tree,
      (node): node is MdxJsxFlowElement => {
        return (
          node.type == "mdxJsxFlowElement" &&
          "name" in node &&
          componentNames.includes(node.name as string)
        );
      },
      (node) => {
        const titleAttribute = node.attributes.find(
          (attribute) => "name" in attribute && attribute.name == "title",
        );
        if (titleAttribute) {
          titleAttribute.value = capitalizeTitle(
            titleAttribute.value as string,
            { special },
          );
        }
      },
    );
  };

export default plugin;

export { DEFAULT_CAPITALIZATIONS } from "./capitalizations.ts";
