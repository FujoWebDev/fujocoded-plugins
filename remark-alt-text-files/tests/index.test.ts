import { beforeEach, expect, test, vi } from "vitest";
import { remark } from "remark";
import { Compatible, VFile } from "vfile";
import { fs, vol } from "memfs";
import { pathToFileURL } from "node:url";
import remarkAltTextFiles from "../index.ts";

/**
 * NOTE TO FUTURE SELF: vitest is annoying about the output of new lines on
 * its output. If tests seem to be failing and you can't tell why, check that
 * you don't have new lines at the beginning or end of expected results.
 */

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
      "markdown-folder/path/to/image.alt.txt":
        "This is the alt text for /path/to/image.png, relative to markdown-folder",

      "./cwd/path/to/image.alt.txt":
        "This is the alt text for /path/to/image.png, from CWD",

      "./path/to/image.alt.txt":
        "This is the alt text from /path/to/image.alt.txt",
    },
    process.cwd()
  );
});

test("should stay unchanged with simple alt text", async () => {
  const result = await processMarkdown(`# Hello, world!

![Hello, world!](/path/to/image.png)`);

  expect(result).toBe(`# Hello, world!

![Hello, world!](/path/to/image.png)`);
});

test("should load specific file when path is provided, from CWD", async () => {
  const result = await processMarkdown(`# Hello, world!

![file:./cwd/path/to/image.alt.txt](/path/to/image.png)`);

  expect(result).toBe(`# Hello, world!

![This is the alt text for /path/to/image.png, from CWD](/path/to/image.png)`);
});

test("should load specific file when path is provided, from file's directory", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/markdown-folder/markdown.md`),
  });
  markdownFile.value = `# Hello, world!

![file:./path/to/image.alt.txt](/path/to/image.png)`;

  const result = await processMarkdown(markdownFile);

  expect(result).toBe(`# Hello, world!

![This is the alt text for /path/to/image.png, relative to markdown-folder](/path/to/image.png)`);
});

test("should load file with same name when no path is provided", async () => {
  const result = await processMarkdown(`# Hello, world!

![file:](/path/to/image.png)`);

  expect(result).toBe(`# Hello, world!

![This is the alt text from /path/to/image.alt.txt](/path/to/image.png)`);
});

test("should fail when file does not exist", async () => {
  await expect(
    async () =>
      await processMarkdown(`# Hello, world!

  ![file:does-not-exist.txt](/path/to/image.png)`)
  ).rejects.toThrowError(
    `Failed to load alt text from files: does-not-exist.txt (as ${process.cwd()}/does-not-exist.txt)`
  );
});

const processMarkdown = async (value: Compatible) => {
  const processedTree = await remark().use(remarkAltTextFiles).process(value);
  return processedTree.toString().slice(0, -1);
};
