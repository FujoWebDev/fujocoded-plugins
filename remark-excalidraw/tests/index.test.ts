import { beforeEach, expect, test, vi } from "vitest";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type mdast from "mdast";
import type { Plugin, Transformer } from "unified";
import { Compatible, VFile } from "vfile";
import remarkExcalidraw, { PluginArgs } from "../src/index.ts";
import { pathToFileURL } from "node:url";
import remarkMdx from "remark-mdx";
import { fs, vol } from "memfs";

const processMarkdown = async (value: Compatible, options?: PluginArgs) => {
  const processedTree = await remark()
    .use(remarkExcalidraw, options ?? {})
    .use(remarkMdx)
    .process(value);
  return processedTree.toString().slice(0, -1);
};

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
      "./tests/test-image.excalidraw": `{ image: excalidraw }`,
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

Have a Excalidraw image: <ExcalidrawComponent fileContent="{ image: excalidraw }" alt="Alt text" client:only="react" />`);
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

<ExcalidrawComponent fileContent="{ image: excalidraw }" alt="Alt text" data-name="test-image" client:only="react" />`);
});

test("can wrap transformed images in an imported MDX component", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/tests/markdown.md`),
  });
  markdownFile.value = `# Hello, world!
Have a Excalidraw image: ![A cool pic](./test-image.excalidraw)
`;
  let observedMarkdownPath: string | undefined;

  const result = await processMarkdown(markdownFile, {
    wrapper: {
      name: "ZoomableFigure",
      importPath: ({ markdownPath }) => {
        observedMarkdownPath = markdownPath;
        return "../components/ZoomableFigure.astro";
      },
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
  <ExcalidrawComponent fileContent="{ image: excalidraw }" alt="A cool pic" client:only="react" />
</ZoomableFigure>`);
  expect(observedMarkdownPath).toBe(`${process.cwd()}/tests/markdown.md`);
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
  <ExcalidrawComponent fileContent="{ image: excalidraw }" alt="Alt text" client:only="react" />
</ZoomableFigure>`);
});
