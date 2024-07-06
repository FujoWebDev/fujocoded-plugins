import { visit } from "unist-util-visit";
import type { Plugin, Transformer } from "unified";
import { isElement } from "hast-util-is-element";
import { h } from "hastscript";

import type * as hast from "hast";

type PluginArgs = {};

// We match command parameters of the form --flag [parameter_name]
const PARAMETER_REGEX = /(\[[a-z0-9_\-]+\])/gi;

const isCodeWithSingleText = <
  T extends hast.Element & {
    children: [hast.Text];
  }
>(
  node: hast.Node
): node is T => {
  return (
    isElement(node) &&
    node.tagName == "code" &&
    node.children.length == 1 &&
    node.children[0]?.type == "text"
  );
};

export const rehypeCodeParam: Plugin<
  PluginArgs[],
  hast.Root
> = ({}: PluginArgs = {}): Transformer<hast.Root> => {
  return (tree) => {
    return visit(
      tree,
      (node) => {
        return (
          isCodeWithSingleText(node) &&
          PARAMETER_REGEX.test(node.children[0].value)
        );
      },
      (node) => {
        if (!isCodeWithSingleText(node)) {
          return;
        }
        const nodeValue = node.children[0].value;
        const matches = nodeValue.split(new RegExp(PARAMETER_REGEX));
        const newChildren: (hast.Element | hast.Text)[] = [];
        for (const match of matches) {
          if (match.startsWith("[") && match.endsWith("]")) {
            const paramSpan = h("span.rehype-param", match);
            newChildren.push(paramSpan);
            continue;
          }
          newChildren.push({
            type: "text",
            value: match,
          });
        }

        // @ts-expect-error We narrowed the type of children with isCodeWithSingleText, but newChildren is valid here.
        node.children = newChildren;
      }
    );
  };
  ``;
};
