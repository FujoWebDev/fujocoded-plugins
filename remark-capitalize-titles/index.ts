import title from "title";
import { visit } from "unist-util-visit";
import type { Pluggable } from "unified";

export default ({ options } = { options: [] }): Pluggable =>
  (tree) => {
    visit(tree, "heading", (node) => {
      visit(node, "text", (textNode) => {
        const text = textNode.value ? textNode.value.trim() : "";
        textNode.value = title(text, { special: options });
      });
    });
  };
