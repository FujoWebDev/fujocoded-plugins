import { visit } from "unist-util-visit";
import type { Plugin, Transformer } from "unified";

import type hast from "hast";
import { headingRank } from "hast-util-heading-rank";
import { toHtml } from "hast-util-to-html";
import { filter } from "unist-util-filter";
import { toString } from "mdast-util-to-string";

declare module "vfile" {
  interface DataMap {
    astro: Record<string, unknown> & {
      frontmatter: {
        headings: Array<{
          text: string;
          html: string;
          depth: number;
          slug: string;
        }>;
      };
    };
  }
}

export const astroRehypeHtmlHeadings: Plugin<
  [],
  hast.Root
> = (): Transformer<hast.Root> => {
  return (tree, file) => {
    if (!file.data.astro) {
      throw new Error(
        `[astro-rehype-html-headings]: Plugin can only be used within Astro context`
      );
    }

    file.data.astro!.frontmatter.headings = [];
    return visit(tree, "element", (node) => {
      if (!headingRank(node)) {
        return;
      }
      const newTree = filter(node, (node) => node.type != "mdxJsxTextElement");
      if (!newTree) {
        return;
      }

      file.data.astro!.frontmatter["headings"].push({
        text: toString(newTree),
        html: toHtml(newTree.children),
        depth: parseInt(node.tagName.substring(1)),
        slug: node.properties.id as string,
      });
    });
  };
};
