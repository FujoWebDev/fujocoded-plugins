import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

import { DEFAULT_CAPITALIZATIONS } from "./capitalizations.ts";
import { titleCase } from "./title-case.ts";

// Matches a Markdown inline code span (backtick-wrapped) so titles can be
// split around code spans and left untouched.
const CODE_REGEX = /(`[a-z0-9_\-\s]+`)/gi;

// Title-case a standalone string (treated as a whole title), leaving inline
// code spans untouched. The plugin uses this for frontmatter and component
// title props; it's exported for callers who want title-casing outside a
// Markdown tree.
export const capitalizeTitle = (
  title: string,
  { special = DEFAULT_CAPITALIZATIONS }: { special?: string[] } = {},
): string => {
  const parts = title.split(new RegExp(CODE_REGEX));
  return parts
    .map((part, idx) => {
      if (part.startsWith("`") && part.endsWith("`")) return part;
      return titleCase(part, {
        special,
        isFirstTextNode: idx === 0,
        isLastTextNode: idx === parts.length - 1,
      });
    })
    .join("");
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
  }: PluginOptions = {}) =>
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

    // Pass 1: every heading. A heading's text can be split across multiple text
    // nodes (e.g. emphasis, links, inline code), so we collect them first to
    // find out which is the first/last text node.
    visit(tree, "heading", (node) => {
      // Get every text node for this heading
      const textNodes: { value?: string }[] = [];
      visit(node, "text", (textNode) => {
        textNodes.push(textNode);
      });
      // Lowercase each node, but be mindful of which one is first/last
      textNodes.forEach((textNode, i) => {
        textNode.value = titleCase(textNode.value ?? "", {
          special,
          isFirstTextNode: i === 0,
          isLastTextNode: i === textNodes.length - 1,
        });
      });
    });
    if (componentNames.length === 0) {
      return;
    }
    // Pass 2: title props of the named MDX components. Their value is one raw
    // string, so capitalizeTitle handles code-span splitting itself.
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
