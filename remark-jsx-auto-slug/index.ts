import { visit } from "unist-util-visit";
import type { Plugin, Transformer } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

type PluginArgs = {
  componentNames: string[];
};

// We only take valid letter, numbers and -_ from the title to turn into a slug
const TITLE_REGEX = /[^a-zA-Z0-9-_]/g;

export const remarkJsxAutoSlug: Plugin<PluginArgs[], mdast.Root> = ({
  componentNames,
}: PluginArgs): Transformer<mdast.Root> => {
  return (tree) => {
    return visit(
      tree,
      (node): node is MdxJsxFlowElement => {
        return (
          node.type == "mdxJsxFlowElement" &&
          "name" in node &&
          componentNames.includes(node.name as string)
        );
      },
      (node) => {
        const slug = node.attributes.find(
          (attribute: any) => "name" in attribute && attribute.name == "slug"
        )?.value as string;

        if (slug) {
          return;
        }

        const title = node.attributes.find(
          (attribute) => "name" in attribute && attribute.name == "title"
        )?.value as string;

        if (!title) {
          throw new Error(
            `[remark-jsx-auto-slug]: ${node.name} should have title property`
          );
        }

        if (!slug) {
          node.attributes.push({
            type: "mdxJsxAttribute",
            name: "slug",
            value: title
              .toLowerCase()
              .replaceAll(" ", "-")
              .replace(new RegExp(TITLE_REGEX), ""),
          });
        }
      }
    );
  };
};
