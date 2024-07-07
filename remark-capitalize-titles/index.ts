import title from "title";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

import { DEFAULT_CAPITALIZATIONS as DEFAULT_CAPITALIZATIONS_ } from "./capitalizations.ts";

type PluginArgs = { special: string[]; componentNames: string[] };
// We match command parameters of the form --flag [parameter_name]
const CODE_REGEX = /(\`[a-z0-9_\-\s]+\`)/gi;

const plugin: Plugin<PluginArgs[], mdast.Root> =
  (
    { special, componentNames }: PluginArgs = {
      special: DEFAULT_CAPITALIZATIONS_,
      componentNames: [],
    }
  ) =>
  (tree) => {
    visit(tree, "heading", (node) => {
      visit(node, "text", (textNode) => {
        textNode.value = title(textNode.value ?? "", { special });
      });
    });
    if (componentNames.length > 0) {
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
            (attribute) => "name" in attribute && attribute.name == "title"
          );
          if (titleAttribute) {
            const titleWithSplitCode = (titleAttribute.value as string).split(
              new RegExp(CODE_REGEX)
            );
            titleAttribute.value = titleWithSplitCode
              .map((part) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                  return part;
                } else {
                  return title(part, { special });
                }
              })
              .join("");
          }
        }
      );
    }
  };

export default plugin;

export const DEFAULT_CAPITALIZATIONS = DEFAULT_CAPITALIZATIONS_;
