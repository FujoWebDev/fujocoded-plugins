import { visitParents } from "unist-util-visit-parents";
import type { Plugin } from "unified";
import { readFile } from "node:fs/promises";
import path, { dirname } from "node:path";

import type mdast from "mdast";
import type { MdxJsxAttribute, MdxJsxFlowElement } from "mdast-util-mdx";
import {
  createDefaultImportNode,
  createMdxJsxAttribute,
  createMdxJsxAttributes,
  createMdxJsxFlowElement,
  createNamedImportNode,
  hasMdxImport,
  isExcalidrawImage,
  createWrappedExcalidrawComponent,
  type ParentWithChildren,
} from "./nodes.ts";
import {
  getSceneDimensions,
  type SceneDimensions,
} from "./scene-dimensions.ts";

export interface ExcalidrawWrapperContext {
  alt: string;
  fileName: string;
  imageUrl: string;
  markdownPath: string | undefined;
  sourcePath: string;
}

export interface ExcalidrawWrapperOptions {
  name: string;
  importPath?: string | ((context: ExcalidrawWrapperContext) => string);
  attributes?:
    | Record<string, string | undefined>
    | ((
        context: ExcalidrawWrapperContext,
      ) => Record<string, string | undefined>);
}

export interface PluginArgs {
  /**
   * Optional. Sets the padding added around the scene.
   *
   * When omitted, each drawing gets 10 pixels of padding on every side.
   */
  exportPadding?: number;
  wrapper?: ExcalidrawWrapperOptions;
}

const EXCALIDRAW_IMPORT_PATH = "@fujocoded/remark-excalidraw/component";
const EXCALIDRAW_COMPONENT_NAME = "ExcalidrawComponent";

const plugin: Plugin<PluginArgs[], mdast.Root> =
  (options = {}) =>
  async (tree, vfile) => {
    const pendingFiles: Array<{
      excalidrawComponent: MdxJsxFlowElement;
      fileContentProp: MdxJsxAttribute;
      fileContent: Promise<string>;
    }> = [];
    let wrapperComponentImport:
      | { source: string; localName: string }
      | undefined;

    visitParents(tree, isExcalidrawImage, (node, ancestors) => {
      const { parent, indexInParent } = getParentSlot({ node, ancestors });
      const { sourcePath, wrapperContext } = createImageContext({
        image: node,
        markdownPath: vfile.history[0],
      });

      // The fileContent prop in <ExcalidrawComponent fileContent="..." />
      const fileContentProp = createMdxJsxAttribute({
        name: "fileContent",
        value: node.url,
      });
      // The actual <ExcalidrawComponent ... />
      const excalidrawComponent = createMdxJsxFlowElement({
        name: "ExcalidrawComponent",
        attributes: [
          fileContentProp,
          createMdxJsxAttribute({
            name: "alt",
            value: node.alt,
          }),
          ...createMdxJsxAttributes({ hProperties: node.data?.hProperties }),
          createMdxJsxAttribute({
            name: "client:load",
            value: null,
          }),
        ],
      });

      parent.children[indexInParent] = options.wrapper
        ? createWrappedExcalidrawComponent({
            wrapper: options.wrapper,
            context: wrapperContext,
            child: excalidrawComponent,
          })
        : excalidrawComponent;
      pendingFiles.push({
        excalidrawComponent,
        fileContentProp,
        fileContent: readFile(sourcePath, "utf-8"),
      });

      // Multiple drawings can share one wrapper component import in the generated MDX,
      // so we directly save it the first time we create it.
      wrapperComponentImport ??= getWrapperComponentImport({
        wrapper: options.wrapper,
        context: wrapperContext,
      });
    });

    await Promise.all(
      pendingFiles.map(
        async ({ excalidrawComponent, fileContentProp, fileContent }) => {
          const loadedFileContent = await fileContent;
          fileContentProp.value = loadedFileContent;
          addInferredDimensionProps({
            node: excalidrawComponent,
            dimensions: getSceneDimensions(loadedFileContent, options),
          });
        },
      ),
    );

    maybeAddImports({
      tree,
      hasTransformedImages: pendingFiles.length > 0,
      wrapperComponentImport,
    });
  };

function getParentSlot({
  node,
  ancestors,
}: {
  node: mdast.Image;
  ancestors: ParentWithChildren[];
}): {
  parent: ParentWithChildren;
  indexInParent: number;
} {
  const parent = ancestors[ancestors.length - 1];
  const indexInParent =
    parent?.children.findIndex((child) => child === node) ?? -1;

  if (!parent || indexInParent === -1) {
    throw Error("Node should have a parent it is a child of");
  }

  return { parent, indexInParent };
}

// We create the MDX node before the file read finishes. Once the content is
// loaded, this adds the size props to that same node so the output keeps its
// original attribute order.
function addInferredDimensionProps({
  node,
  dimensions,
}: {
  node: MdxJsxFlowElement;
  dimensions: SceneDimensions | undefined;
}) {
  if (!dimensions) return;

  const clientLoadIndex =
    node.attributes?.findIndex(
      (attribute) =>
        attribute.type === "mdxJsxAttribute" &&
        attribute.name === "client:load",
    ) ?? -1;
  const dimensionAttributes = [
    createMdxJsxAttribute({
      name: "width",
      value: String(dimensions.width),
    }),
    createMdxJsxAttribute({
      name: "height",
      value: String(dimensions.height),
    }),
  ];

  if (clientLoadIndex === -1) {
    node.attributes?.push(...dimensionAttributes);
    return;
  }

  node.attributes?.splice(clientLoadIndex, 0, ...dimensionAttributes);
}

function createImageContext({
  image,
  markdownPath,
}: {
  image: mdast.Image;
  markdownPath: string | undefined;
}): {
  sourcePath: string;
  wrapperContext: ExcalidrawWrapperContext;
} {
  const sourcePath = path.join(
    markdownPath ? dirname(markdownPath) : process.cwd(),
    image.url,
  );

  return {
    sourcePath,
    wrapperContext: {
      alt: image.alt ?? "",
      fileName: path.basename(image.url, path.extname(image.url)),
      imageUrl: image.url,
      markdownPath,
      sourcePath,
    },
  };
}

function getWrapperComponentImport({
  wrapper,
  context,
}: {
  wrapper: ExcalidrawWrapperOptions | undefined;
  context: ExcalidrawWrapperContext;
}): { source: string; localName: string } | undefined {
  if (!wrapper?.importPath) return undefined;

  return {
    source:
      typeof wrapper.importPath === "function"
        ? wrapper.importPath(context)
        : wrapper.importPath,
    localName: wrapper.name,
  };
}

function maybeAddImports({
  tree,
  hasTransformedImages,
  wrapperComponentImport,
}: {
  tree: mdast.Root;
  hasTransformedImages: boolean;
  wrapperComponentImport: { source: string; localName: string } | undefined;
}) {
  if (!hasTransformedImages) return;

  if (
    !hasMdxImport({
      tree,
      source: EXCALIDRAW_IMPORT_PATH,
      localName: EXCALIDRAW_COMPONENT_NAME,
    })
  ) {
    tree.children.unshift(
      createNamedImportNode({
        source: EXCALIDRAW_IMPORT_PATH,
        importedName: EXCALIDRAW_COMPONENT_NAME,
      }),
    );
  }

  if (
    wrapperComponentImport &&
    !hasMdxImport({
      tree,
      source: wrapperComponentImport.source,
      localName: wrapperComponentImport.localName,
    })
  ) {
    tree.children.unshift(createDefaultImportNode(wrapperComponentImport));
  }
}

export default plugin;
