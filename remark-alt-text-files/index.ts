import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { posix } from "node:path";
import { VFile } from "vfile";

import type mdast from "mdast";

export interface PluginArgs {
  /**
   * Optional. Lets you change the text that marks an image alt value as a file
   * path.
   *
   * When omitted, the plugin looks for alt text that starts with `file:`.
   */
  pathPrefix?: string;
  /**
   * Optional. Sets the directory where alt text files are loaded from.
   *
   * When omitted, the plugin uses the directory of the Markdown file. If the
   * Markdown file has no path, it uses `process.cwd()`.
   */
  root?: string;
  /**
   * Optional. Adds source metadata to each image after its alt text is loaded.
   *
   * You can pass a path of URL when every source path should start from
   * the same place, or a function for fancy cases.
   *
   * When omitted, the metadata value is the alt text file path from Markdown.
   */
  sourceLocation?:
    | string
    | ((context: {
        altPath: string;
        imagePath: string;
        markdownPath?: string;
        resolvedAltPath: string;
      }) => string);
  /**
   * Optional. Adds source metadata to the image.
   *
   * Pass `true` to write `data-alt-source`. Pass a string to write that
   * attribute instead.
   *
   * When omitted, the plugin skips source metadata.
   */
  targetAttribute?: boolean | string;
  /**
   * Optional. Controls what happens when an alt text file cannot be loaded.
   *
   * - `"error"` => throw an error and stop processing
   * - `"warn"` => add a Markdown warning and keep the original alt text
   * - `"ignore"` => keep the original alt text without a warning
   *
   * When omitted, missing files use `"error"`.
   */
  missingFile?: "error" | "ignore" | "warn";
}

type ResolvedPluginArgs = Omit<PluginArgs, "pathPrefix"> & {
  pathPrefix: string;
};

type MissingAltFile = {
  imagePath: string;
  altPath: string;
  filePath: string;
};

const getAltPath = ({
  imageNode,
  options,
}: {
  imageNode: mdast.Image;
  options: ResolvedPluginArgs;
}) => {
  const altPath = imageNode.alt!.slice(options.pathPrefix.length);
  return altPath != ""
    ? altPath
    : imageNode.url.replace(/\.[^.]+$/, ".alt.txt")!;
};

const getFilePath = ({
  altPath,
  vfile,
  options,
}: {
  altPath: string;
  vfile: VFile;
  options: ResolvedPluginArgs;
}) => {
  return join(
    // If the root is provided, use it
    // Otherwise, if this was loaded from a file, then use the directory of that file
    // Otherwise, use the current working directory
    options.root
      ? options.root
      : vfile.history[0]
        ? dirname(vfile.history[0])
        : process.cwd(),
    altPath,
  );
};

const getSourcePath = ({
  altPath,
  imageNode,
  vfile,
  resolvedAltPath,
  options,
}: {
  altPath: string;
  imageNode: mdast.Image;
  vfile: VFile;
  resolvedAltPath: string;
  options: ResolvedPluginArgs;
}) => {
  const sourceLocation = options.sourceLocation;

  if (typeof sourceLocation === "function") {
    return sourceLocation({
      altPath,
      imagePath: imageNode.url,
      markdownPath: vfile.history[0],
      resolvedAltPath,
    });
  }

  if (!sourceLocation) {
    return altPath;
  }

  if (/^https?:\/\//.test(sourceLocation)) {
    return new URL(
      altPath.replace(/^\/+/, ""),
      `${sourceLocation}/`,
    ).toString();
  }

  return posix.normalize(posix.join(sourceLocation, altPath));
};

const addHProperty = (
  node: mdast.Image,
  key: string,
  value: string | undefined,
) => {
  if (!value) {
    return;
  }

  node.data ??= {};
  // remark-rehype reads hProperties when turning this mdast image into HTML.
  const data = node.data as mdast.Image["data"] & {
    hProperties?: Record<string, unknown>;
  };
  data.hProperties ??= {};
  data.hProperties[key] = value;
};

const addSourceMetadata = ({
  altPath,
  imageNode,
  vfile,
  filePath,
  options,
}: {
  altPath: string;
  imageNode: mdast.Image;
  vfile: VFile;
  filePath: string;
  options: ResolvedPluginArgs;
}) => {
  if (!options.targetAttribute) {
    return;
  }

  const targetAttribute =
    options.targetAttribute === true
      ? "data-alt-source"
      : options.targetAttribute;

  // Capture the author-facing alt file path before the file contents replace
  // the image alt text below.
  addHProperty(
    imageNode,
    targetAttribute,
    getSourcePath({
      altPath,
      imageNode,
      vfile,
      resolvedAltPath: filePath,
      options,
    }),
  );
};

const getMissingFileMessage = (missingFiles: MissingAltFile[]) => {
  const [missingFile] = missingFiles;
  if (missingFiles.length === 1 && missingFile) {
    const { imagePath, altPath, filePath } = missingFile;
    return `Failed to load alt text for image ${imagePath}. Tried ${altPath} as ${filePath}`;
  }

  return `Failed to load alt text for images: ${missingFiles
    .map(
      ({ imagePath, altPath, filePath }) =>
        `${imagePath} (tried ${altPath} as ${filePath})`,
    )
    .join(", ")}`;
};

const plugin: Plugin<PluginArgs[], mdast.Root> =
  ({
    pathPrefix = "file:",
    root,
    sourceLocation,
    targetAttribute,
    missingFile = "error",
  } = {}) =>
  async (tree, vfile) => {
    const loadingAltText: Promise<string>[] = [];
    const loadingAltFiles: MissingAltFile[] = [];
    const options = {
      pathPrefix,
      root,
      sourceLocation,
      targetAttribute,
      missingFile,
    };

    visit(tree, "image", (node) => {
      if (!node.alt || !node.alt.startsWith(pathPrefix)) {
        return;
      }
      const altPath = getAltPath({ imageNode: node, options });
      const filePath = getFilePath({ altPath, vfile, options });
      addSourceMetadata({ altPath, imageNode: node, vfile, filePath, options });
      loadingAltText.push(
        readFile(filePath, "utf8").then((text) => (node.alt = text.trim())),
      );
      loadingAltFiles.push({
        imagePath: node.url,
        altPath,
        filePath,
      });
    });

    const results = await Promise.allSettled(loadingAltText);

    // Report all missing files together, regardless of whether the
    // caller wants that report as a warning or an exception.
    const missingFiles = results
      .map((result, index) =>
        result.status === "rejected" ? loadingAltFiles[index] : null,
      )
      .filter(
        (file): file is MissingAltFile => file !== null && file !== undefined,
      );

    if (missingFiles.length === 0 || missingFile === "ignore") {
      return tree;
    }

    const message = getMissingFileMessage(missingFiles);

    if (missingFile === "warn") {
      vfile.message(message);
      return tree;
    }

    throw new Error(message);
  };

export default plugin;
