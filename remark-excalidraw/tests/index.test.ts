import { beforeEach, expect, test, vi } from "vitest";
import { remark } from "remark";
import { Compatible, VFile } from "vfile";
import remarkExcalidraw, { PluginArgs } from "../index.ts";
import { pathToFileURL } from "node:url";
import remarkMdx from "remark-mdx";
import { fs, vol } from "memfs";

vi.mock("node:fs/promises", async () => {
  const memfs: { fs: typeof fs } = await vi.importActual("memfs");

  // Support both `import fs from "fs"` and "import { readFileSync } from "fs"`
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
  };
});

// /Users/essentialrandomness/projects/programming/mdx-plugins/
beforeEach(() => {
  vol.reset();
  vol.fromJSON(
    {
      "./tests/test-image.excalidraw": `{ image: excalidraw }`,
    },
    process.cwd()
  );
});

test("should stay unchanged with simple alt text", async () => {
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

Have a Excalidraw image: <ExcalidrawComponent fileContent="{ image: excalidraw }" alt="Alt text" />`);
});

const processMarkdown = async (value: Compatible, options?: PluginArgs) => {
  const processedTree = await remark()
    .use(remarkExcalidraw, options ?? {})
    .use(remarkMdx)
    .process(value);
  return processedTree.toString().slice(0, -1);
};
