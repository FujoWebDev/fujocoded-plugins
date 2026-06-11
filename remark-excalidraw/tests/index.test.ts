import { beforeEach, expect, test, vi } from "vitest";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type mdast from "mdast";
import type { Transformer } from "unified";
import { Compatible, VFile } from "vfile";
import remarkExcalidraw, { PluginArgs } from "../src/index.ts";
import { pathToFileURL } from "node:url";
import remarkMdx from "remark-mdx";
import { fs, vol } from "memfs";
import { getSceneDimensions } from "../src/scene-dimensions.ts";

const processMarkdown = async (value: Compatible, options?: PluginArgs) => {
  const processedTree = await remark()
    .use(remarkExcalidraw, options ?? {})
    .use(remarkMdx)
    .process(value);
  return processedTree.toString().slice(0, -1);
};

const testImageContent = JSON.stringify({
  type: "excalidraw",
  elements: [
    {
      type: "rectangle",
      x: 10,
      y: 20,
      width: 300,
      height: 140,
    },
    {
      type: "text",
      x: 380,
      y: 90,
      width: 120,
      height: 50,
    },
  ],
});
const serializedTestImageContent = testImageContent.replaceAll('"', "&#x22;");

vi.mock("node:fs/promises", async () => {
  const memfs: { fs: typeof fs } = await vi.importActual("memfs");

  // Support both `import fs from "fs"` and "import { readFileSync } from "fs"`
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
  };
});

beforeEach(() => {
  vol.reset();
  vol.fromJSON(
    {
      "./tests/test-image.excalidraw": testImageContent,
    },
    process.cwd(),
  );
});

test("imports the Excalidraw renderer for transformed images", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `# Hello, world!
Have a Excalidraw image: ![Alt text](./test-image.excalidraw)
`;

  const result = await processMarkdown(markdownFile);

  expect(result)
    .toBe(`import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

# Hello, world!

Have a Excalidraw image: <ExcalidrawComponent fileContent="${serializedTestImageContent}" alt="Alt text" width="510" height="160" client:load />`);
});

test("preserves data attributes added to the original image", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `![Alt text](./test-image.excalidraw)
`;

  const processedTree = await remark()
    .use(
      (): Transformer<mdast.Root> => (tree) => {
        visit(tree, "image", (node) => {
          node.data ??= {};
          node.data.hProperties = {
            ...node.data.hProperties,
            "data-name": "test-image",
          };
        });
      },
    )
    .use(remarkExcalidraw)
    .use(remarkMdx)
    .process(markdownFile);

  expect(processedTree.toString().slice(0, -1))
    .toBe(`import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

<ExcalidrawComponent fileContent="${serializedTestImageContent}" alt="Alt text" data-name="test-image" width="510" height="160" client:load />`);
});

test("can wrap transformed images in an imported MDX component", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `# Hello, world!
Have a Excalidraw image: ![A cool pic](./test-image.excalidraw)
`;

  const result = await processMarkdown(markdownFile, {
    wrapper: {
      name: "ZoomableFigure",
      importPath: "../components/ZoomableFigure.astro",
      attributes: ({ alt, fileName, markdownPath }) => ({
        id: fileName,
        linkLabel: `Link to ${alt} drawing`,
        "data-markdown": markdownPath ? "present" : undefined,
      }),
    },
  });

  expect(result)
    .toBe(`import ZoomableFigure from "../components/ZoomableFigure.astro";

import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

# Hello, world!

Have a Excalidraw image: <ZoomableFigure id="test-image" linkLabel="Link to A cool pic drawing" data-markdown="present">
  <ExcalidrawComponent fileContent="${serializedTestImageContent}" alt="A cool pic" width="510" height="160" client:load />
</ZoomableFigure>`);
});

test("passes drawing context to wrapper callbacks", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `![A cool pic](./test-image.excalidraw)
`;
  const observedContext: Partial<{
    alt: string;
    fileName: string;
    imageUrl: string;
    markdownPath: string | undefined;
    sourcePath: string;
  }> = {};

  await processMarkdown(markdownFile, {
    wrapper: {
      name: "ZoomableFigure",
      importPath: (context) => {
        Object.assign(observedContext, context);
        return "../components/ZoomableFigure.astro";
      },
    },
  });

  expect(observedContext).toEqual({
    alt: "A cool pic",
    fileName: "test-image",
    imageUrl: "./test-image.excalidraw",
    markdownPath: `${process.cwd()}/tests/markdown.md`,
    sourcePath: `${process.cwd()}/tests/test-image.excalidraw`,
  });
});

test("does not duplicate existing imports", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `import ZoomableFigure from "../components/ZoomableFigure.astro";
import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

![Alt text](./test-image.excalidraw)
`;

  const result = await processMarkdown(markdownFile, {
    wrapper: {
      name: "ZoomableFigure",
      importPath: "../components/ZoomableFigure.astro",
    },
  });

  expect(result)
    .toBe(`import ZoomableFigure from "../components/ZoomableFigure.astro";
import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

<ZoomableFigure>
  <ExcalidrawComponent fileContent="${serializedTestImageContent}" alt="Alt text" width="510" height="160" client:load />
</ZoomableFigure>`);
});

test("uses configured export padding for inferred dimensions", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `![Alt text](./test-image.excalidraw)
`;

  const result = await processMarkdown(markdownFile, {
    exportPadding: 0,
  });

  expect(result)
    .toBe(`import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

<ExcalidrawComponent fileContent="${serializedTestImageContent}" alt="Alt text" width="490" height="140" client:load />`);
});

test("keeps rendering client-side when scene dimensions cannot be inferred", async () => {
  vol.fromJSON(
    {
      "./tests/broken-image.excalidraw": `{ image: excalidraw }`,
    },
    process.cwd(),
  );
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `![Alt text](./broken-image.excalidraw)
`;

  const result = await processMarkdown(markdownFile);

  expect(result)
    .toBe(`import { ExcalidrawComponent } from "@fujocoded/remark-excalidraw/component";

<ExcalidrawComponent fileContent="{ image: excalidraw }" alt="Alt text" client:load />`);
});

test("infers scene dimensions from visible elements only", () => {
  const dimensions = getSceneDimensions(
    JSON.stringify({
      type: "excalidraw",
      elements: [
        {
          type: "rectangle",
          x: -10,
          y: 20,
          width: 40,
          height: 50,
        },
        {
          type: "arrow",
          x: 100,
          y: 10,
          points: [
            [0, 0],
            [50, 90],
          ],
        },
        {
          type: "rectangle",
          isDeleted: true,
          x: 0,
          y: 0,
          width: 1000,
          height: 1000,
        },
      ],
    }),
  );

  expect(dimensions).toEqual({ width: 180, height: 110 });
});

test("uses configured export padding for scene dimensions", () => {
  expect(getSceneDimensions(testImageContent, { exportPadding: 0 })).toEqual({
    width: 490,
    height: 140,
  });
});
