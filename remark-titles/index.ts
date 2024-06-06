import title from "title";
import { visit } from "unist-util-visit";

export default ({ options } = { options: [] }) =>
  (tree) => {
    visit(tree, "heading", (node) => {
      visit(node, "text", (textNode) => {
        const text = textNode.value ? textNode.value.trim() : "";
        textNode.value = title(text, { special: options });
      });
    });
  };
