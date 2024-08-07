import { visit } from "unist-util-visit";
import type { Plugin, Transformer } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

type PluginArgs = {
  components: [
    {
      name: string;
      attributes: string[];
      frontmatterName: string;
    }
  ];
};

export const astroRemarkCollectComponents: Plugin<PluginArgs[], mdast.Root> = ({
  components,
}: PluginArgs): Transformer<mdast.Root> => {
  return (tree, file) => {
    if (!(file.data.astro as any)) {
      throw new Error(
        `[astro-remark-collect-components]: Plugin can only be used within Astro context`
      );
    }
    components.forEach((c) => {
      (file.data.astro as any).frontmatter[c.frontmatterName] = [];
    });
    return visit(
      tree,
      (node): node is MdxJsxFlowElement => {
        return (
          node.type == "mdxJsxFlowElement" &&
          "name" in node &&
          components.flatMap((c) => c.name).includes(node.name as string)
        );
      },
      (node) => {
        const componentConfig = components.find((c) => c.name == node.name);
        if (!componentConfig) {
          throw new Error(
            `[astro-remark-collect-components]: No config found for ${node.name}`
          );
        }

        const values = componentConfig.attributes.reduce(
          (aggregate, current) => {
            aggregate[current] = node.attributes.find(
              (attribute) =>
                "name" in attribute &&
                attribute.name == current &&
                typeof attribute.value == "string"
            )?.value as unknown as string | undefined;

            return aggregate;
          },
          {} as Record<string, string | undefined>
        );

        (file.data.astro as any).frontmatter[
          componentConfig.frontmatterName
        ].push(values);
      }
    );
  };
};
