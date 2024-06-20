import title from "title";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

import type * as mdast from "mdast";

export { DEFAULT_CAPITALIZATIONS } from "./capitalizations.ts";

type PluginArgs = { special: string[] };

const plugin: Plugin<PluginArgs[], mdast.Root> =
  ({ special }: PluginArgs = { special: [] }) =>
  (tree) => {
    visit(tree, "heading", (node) => {
      visit(node, "text", (textNode) => {
        const text = textNode.value ? textNode.value.trim() : "";
        textNode.value = title(text, { special });
      });
    });
  };

export default plugin;
