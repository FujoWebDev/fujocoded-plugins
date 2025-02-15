import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { VFile } from "vfile";

import type mdast from "mdast";

interface PluginArgs {
  pathPrefix?: string;
}

const getFilePath = ({
  imageNode,
  vfile,
  pathPrefix,
}: {
  imageNode: mdast.Image;
  vfile: VFile;
  pathPrefix: string;
}) => {
  let filePath = imageNode.alt!.replace(pathPrefix, "");
  if (filePath == "") {
    // We use the name of the imageNode file and replace the extension with .alt.txt
    filePath = imageNode.url.replace(/\.[^.]+$/, ".alt.txt")!;
  }

  return join(
    // If this was loaded from a file, then use the directory of that file
    // Otherwise, use the current working directory
    vfile.history[0] ? dirname(vfile.history[0]) : process.cwd(),
    filePath
  );
};

const plugin: Plugin<PluginArgs[], mdast.Root> =
  ({ pathPrefix = "file:" } = {}) =>
  async (tree, vfile) => {
    const loadingAltText: Promise<string>[] = [];
    const loadingAltFiles: string[] = [];

    visit(tree, "image", (node) => {
      if (!node.alt || !node.alt.startsWith(pathPrefix)) {
        return;
      }
      const filePath = getFilePath({ imageNode: node, vfile, pathPrefix });
      loadingAltText.push(
        readFile(filePath, "utf8").then((text) => (node.alt = text.trim()))
      );
      loadingAltFiles.push(
        `${node.alt.replace(pathPrefix, "")} (as ${filePath})`
      );
    });

    const results = await Promise.allSettled(loadingAltText);

    if (results.every((result) => result.status === "fulfilled")) {
      return tree;
    }

    throw new Error(
      `Failed to load alt text from files: ${results
        .map((result, index) =>
          result.status === "rejected" ? loadingAltFiles[index] : null
        )
        .filter((file) => file !== null)
        .join(", ")}`
    );
  };

export default plugin;
