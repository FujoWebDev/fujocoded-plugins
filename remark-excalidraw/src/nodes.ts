import type mdast from "mdast";
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxjsEsm,
} from "mdast-util-mdx";
import type {
  ExcalidrawWrapperContext,
  ExcalidrawWrapperOptions,
} from "./index.ts";

declare module "mdast" {
  interface ImageData {
    hProperties?: Record<string, unknown>;
  }
}

export type ParentWithChildren = {
  children: Array<mdast.RootContent | mdast.PhrasingContent>;
};

export function isExcalidrawImage(node: { type: string }): node is mdast.Image {
  return (
    node.type === "image" &&
    "url" in node &&
    typeof node.url === "string" &&
    node.url.endsWith(".excalidraw")
  );
}

export function createDefaultImportNode({
  source,
  localName,
}: {
  source: string;
  localName: string;
}): MdxjsEsm {
  return {
    type: "mdxjsEsm",
    value: `import ${localName} from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportDefaultSpecifier",
                local: {
                  type: "Identifier",
                  name: localName,
                },
              },
            ],
            source: {
              type: "Literal",
              value: source,
              raw: `"${source}"`,
            },
            attributes: [],
          },
        ],
      },
    },
  };
}

export function createNamedImportNode({
  source,
  importedName,
  localName = importedName,
}: {
  source: string;
  importedName: string;
  localName?: string;
}): MdxjsEsm {
  const value =
    localName === importedName
      ? `import { ${importedName} } from "${source}";`
      : `import { ${importedName} as ${localName} } from "${source}";`;

  return {
    type: "mdxjsEsm",
    value,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [
              {
                type: "ImportSpecifier",
                imported: {
                  type: "Identifier",
                  name: importedName,
                },
                local: {
                  type: "Identifier",
                  name: localName,
                },
              },
            ],
            source: {
              type: "Literal",
              value: source,
              raw: `"${source}"`,
            },
            attributes: [],
          },
        ],
      },
    },
  };
}

export function hasMdxImport({
  tree,
  source,
  localName,
}: {
  tree: mdast.Root;
  source: string;
  localName: string;
}): boolean {
  return tree.children.some(
    (node) =>
      node.type === "mdxjsEsm" &&
      "value" in node &&
      typeof node.value === "string" &&
      node.value.includes(source) &&
      node.value.includes(localName),
  );
}

export function createMdxJsxAttribute({
  name,
  value,
}: {
  name: string;
  value: MdxJsxAttribute["value"];
}): MdxJsxAttribute {
  return {
    type: "mdxJsxAttribute",
    name,
    value,
  };
}

export function createMdxJsxAttributes({
  hProperties,
}: {
  hProperties: Record<string, unknown> | undefined;
}): MdxJsxAttribute[] {
  if (!hProperties) {
    return [];
  }
  return Object.entries(hProperties).flatMap(([name, value]) =>
    typeof value === "string" ? [createMdxJsxAttribute({ name, value })] : [],
  );
}

export function createMdxJsxFlowElement({
  name,
  attributes,
  children = [],
}: {
  name: string;
  attributes: MdxJsxFlowElement["attributes"];
  children?: MdxJsxFlowElement["children"];
}): MdxJsxFlowElement {
  return {
    type: "mdxJsxFlowElement",
    name,
    attributes,
    children,
  };
}

export function createWrappedExcalidrawComponent({
  wrapper,
  context,
  child,
}: {
  wrapper: ExcalidrawWrapperOptions;
  context: ExcalidrawWrapperContext;
  child: MdxJsxFlowElement;
}): MdxJsxFlowElement {
  const attributes =
    typeof wrapper.attributes === "function"
      ? wrapper.attributes(context)
      : wrapper.attributes;

  return createMdxJsxFlowElement({
    name: wrapper.name,
    attributes: Object.entries(attributes ?? {}).flatMap(([name, value]) =>
      value === undefined
        ? []
        : [
            createMdxJsxAttribute({
              name,
              value,
            }),
          ],
    ),
    children: [child],
  });
}
