import { visitParents } from "unist-util-visit-parents";
import type { Plugin } from "unified";
import { readFile } from "node:fs/promises";
import path, { join, dirname } from "node:path";
import { exportToSvg } from "@excalidraw/excalidraw";

import type mdast from "mdast";

export interface PluginArgs {}

const plugin: Plugin<PluginArgs[], mdast.Root> = () => async (tree, vfile) => {
  const loadingFilePromises: Promise<string>[] = [];
  const attributeNodes: { value: string }[] = [];

  visitParents(
    tree,
    (node): node is mdast.Image =>
      node.type == "image" && (node as mdast.Image).url.endsWith(".excalidraw"),
    (node, ancestors) => {
      const parent = ancestors[ancestors.length - 1];
      const indexInParent =
        parent?.children.findIndex((child) => child == node) ?? -1;
      if (!parent || indexInParent == -1) {
        throw Error("Node should have a parent it is a child of");
      }

      const contentAttribute = {
        type: "mdxJsxAttribute",
        name: "fileContent",
        value: node.url,
      } as const;

      parent.children[indexInParent] = {
        type: "mdxJsxFlowElement",
        name: "ExcalidrawComponent",
        attributes: [
          contentAttribute,
          {
            type: "mdxJsxAttribute",
            name: "alt",
            value: node.alt,
          },
          {
            type: "mdxJsxAttribute",
            name: "client:only",
            value: "react",
          },
        ],
        children: [],
      };

      const rootPath = vfile.history[0]
        ? dirname(vfile.history[0])
        : process.cwd();
      loadingFilePromises.push(
        readFile(path.join(rootPath, node.url), "utf-8")
      );
      attributeNodes.push(contentAttribute);
    }
  );

  const fileContents = await Promise.all(loadingFilePromises);
  await Promise.all(
    fileContents.map(async (fileContent, index) => {
      attributeNodes[index]!.value = fileContent;
    })
  );

  if (fileContents.length > 0) {
    // TODO: this cannot be done here because this plugin runs after remark-mdx.
    // What we can do is to add info on needing this import to the VFile, and then add
    // a recma plugin that does the import if it finds it in the VFile.
    // tree.children.unshift({
    //   type: "mdxjsEsm",
    //   value:
    //     'import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";',
    // });
  }
};

export default plugin;
