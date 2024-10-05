import { visit } from "unist-util-visit";
import type { Plugin, Transformer } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

type ComponentConfig = {
  name: string;
  attributes: string[];
  defaults: Record<string, string> | undefined;
  frontmatterName: string;
};

type PluginArgs = {
  configs: [
    | ComponentConfig
    | {
        components: Omit<ComponentConfig, "frontmatterName">[];
        frontmatterName: string;
      }
  ];
};

const getConfigWithNodeName = (
  configs: PluginArgs["configs"],
  nodeName: string
) => {
  return configs
    .map((componentConfig) => {
      if (!("components" in componentConfig)) {
        return componentConfig.name == nodeName ? componentConfig : null;
      }
      // Check if component has config for node
      const config = componentConfig.components.find(
        (component) => component.name == nodeName
      );
      if (!config) {
        return null;
      }
      return {
        ...config,
        frontmatterName: componentConfig.frontmatterName,
      };
    })
    .filter(<T>(x: T): x is NonNullable<T> => Boolean(x));
};

export const astroRemarkCollectComponents: Plugin<PluginArgs[], mdast.Root> = ({
  configs,
}: PluginArgs): Transformer<mdast.Root> => {
  const componentNames = configs.flatMap((config) =>
    "components" in config ? config.components.map((c) => c.name) : config.name
  );
  return (tree, file) => {
    if (!(file.data.astro as any)) {
      throw new Error(
        `[astro-remark-collect-components]: Plugin can only be used within Astro context`
      );
    }
    configs.forEach((c) => {
      (file.data.astro as any).frontmatter[c.frontmatterName] = [];
    });
    return visit(
      tree,
      (node): node is MdxJsxFlowElement => {
        return (
          node.type == "mdxJsxFlowElement" &&
          "name" in node &&
          // Check that there is at least a component that includes this file in its name
          componentNames.includes(node.name as string)
        );
      },
      (node) => {
        if (!node.name) {
          throw new Error(
            `[astro-remark-collect-components]: Trying to process node with undefined name.`
          );
        }
        const configsWithNode = getConfigWithNodeName(configs, node.name);
        if (!configsWithNode.length) {
          throw new Error(
            `[astro-remark-collect-components]: No config found for ${node.name}`
          );
        }

        for (const config of configsWithNode) {
          const values = config.attributes.reduce((aggregate, current) => {
            aggregate[current] = node.attributes.find(
              (attribute) =>
                "name" in attribute &&
                attribute.name == current &&
                typeof attribute.value == "string"
            )?.value as unknown as string | undefined;

            // If the value of the attribute wasn't found, we get the default from the component defaults,
            // assuming that such default exists;
            if (!aggregate[current]) {
              aggregate[current] = config.defaults?.[current];
            }

            return aggregate;
          }, {} as Record<string, string | undefined>);

          (file.data.astro as any).frontmatter[config.frontmatterName].push(
            values
          );
        }
      }
    );
  };
};
