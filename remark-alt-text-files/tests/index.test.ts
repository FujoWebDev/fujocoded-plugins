import { beforeEach, expect, test, vi } from "vitest";
import { remark } from "remark";
import { Compatible, VFile } from "vfile";
import { fs, vol } from "memfs";
import { pathToFileURL } from "node:url";
import { visit } from "unist-util-visit";
import remarkAltTextFiles, { PluginArgs } from "../index.ts";
import type mdast from "mdast";

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

      "./root/directory/path/to/image.alt.txt":
        "This is the alt text for /path/to/image.png, relative to root/directory",

      "./root/directory/path/assets/image.alt.txt":
        "This is the alt text for /path/assets/image.png, relative to root/directory/path/to",
    },
    process.cwd(),
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

test("should load specific file when path is provided, from given root", async () => {
  const result = await processMarkdown(
    `# Hello, world!

![file:./path/to/image.alt.txt](/path/to/image.png)`,
    {
      root: `${process.cwd()}/root/directory`,
    },
  );

  expect(result).toBe(`# Hello, world!

![This is the alt text for /path/to/image.png, relative to root/directory](/path/to/image.png)`);
});

test("should load file with same name when no path is provided", async () => {
  const result = await processMarkdown(`# Hello, world!

![file:](/path/to/image.png)`);

  expect(result).toBe(`# Hello, world!

![This is the alt text from /path/to/image.alt.txt](/path/to/image.png)`);
});

test("should skip source metadata by default", async () => {
  const image = await processImage(
    `# Hello, world!

![file:./path/to/image.alt.txt](/path/to/image.png)`,
  );

  expect(image.alt).toBe("This is the alt text from /path/to/image.alt.txt");
  expect(getHProperties(image)).toBeUndefined();
});

test("should add source metadata for the alt text path", async () => {
  const image = await processImage(
    `# Hello, world!

![file:./path/to/image.alt.txt](/path/to/image.png)`,
    {
      targetAttribute: true,
    },
  );

  expect(image.alt).toBe("This is the alt text from /path/to/image.alt.txt");
  expect(getHProperties(image)).toEqual({
    "data-alt-source": "./path/to/image.alt.txt",
  });
});

test("should use implied alt text path as source metadata when no path is provided", async () => {
  const image = await processImage(
    `# Hello, world!

![file:](/path/to/image.png)`,
    {
      targetAttribute: true,
    },
  );

  expect(getHProperties(image)).toEqual({
    "data-alt-source": "/path/to/image.alt.txt",
  });
});

test("should prepend source location to explicit source metadata", async () => {
  const image = await processImage(
    `# Hello, world!

![file:../assets/image.alt.txt](/path/to/image.png)`,
    {
      root: `${process.cwd()}/root/directory/path/to`,
      sourceLocation: "src/content/posts",
      targetAttribute: true,
    },
  );

  expect(getHProperties(image)).toEqual({
    "data-alt-source": "src/content/assets/image.alt.txt",
  });
});

test("should support URL source locations", async () => {
  const image = await processImage(
    `# Hello, world!

![file:../assets/image.alt.txt](/path/to/image.png)`,
    {
      root: `${process.cwd()}/root/directory/path/to`,
      sourceLocation:
        "https://github.com/owner/repo/blob/main/src/content/posts",
      targetAttribute: true,
    },
  );

  expect(getHProperties(image)).toEqual({
    "data-alt-source":
      "https://github.com/owner/repo/blob/main/src/content/assets/image.alt.txt",
  });
});

test("should support source location functions", async () => {
  const markdownFile = new VFile({
    path: pathToFileURL(`${process.cwd()}/markdown-folder/markdown.md`),
  });
  markdownFile.value = `# Hello, world!

![file:./path/to/image.alt.txt](./path/to/image.png)`;

  const image = await processImage(markdownFile, {
    sourceLocation: ({ altPath, imagePath, markdownPath, resolvedAltPath }) => {
      expect(altPath).toBe("./path/to/image.alt.txt");
      expect(imagePath).toBe("./path/to/image.png");
      expect(markdownPath).toBe(`${process.cwd()}/markdown-folder/markdown.md`);
      expect(resolvedAltPath).toBe(
        `${process.cwd()}/markdown-folder/path/to/image.alt.txt`,
      );
      return `custom:${altPath}`;
    },
    targetAttribute: true,
  });

  expect(getHProperties(image)).toEqual({
    "data-alt-source": "custom:./path/to/image.alt.txt",
  });
});

test("should prepend source location to implied source metadata", async () => {
  const image = await processImage(
    `# Hello, world!

![file:](./path/to/image.png)`,
    {
      sourceLocation: "src/content",
      targetAttribute: true,
    },
  );

  expect(getHProperties(image)).toEqual({
    "data-alt-source": "src/content/path/to/image.alt.txt",
  });
});

test("should support custom source metadata target attributes", async () => {
  const image = await processImage(
    `# Hello, world!

![file:./path/to/image.alt.txt](/path/to/image.png)`,
    {
      targetAttribute: "data-alt-text-path",
    },
  );

  expect(getHProperties(image)).toEqual({
    "data-alt-text-path": "./path/to/image.alt.txt",
  });
});

test("should allow source metadata to be disabled explicitly", async () => {
  const image = await processImage(
    `# Hello, world!

![file:./path/to/image.alt.txt](/path/to/image.png)`,
    {
      targetAttribute: false,
    },
  );

  expect(getHProperties(image)).toBeUndefined();
});

test("should report the implied alt text path when implied file is missing", async () => {
  await expect(
    async () =>
      await processMarkdown(`# Hello, world!

![file:](/path/to/missing.png)`),
  ).rejects.toThrowError(
    `Failed to load alt text for image /path/to/missing.png. Tried /path/to/missing.alt.txt as ${process.cwd()}/path/to/missing.alt.txt`,
  );
});

test("should fail when file does not exist", async () => {
  await expect(
    async () =>
      await processMarkdown(`# Hello, world!

  ![file:does-not-exist.txt](/path/to/image.png)`),
  ).rejects.toThrowError(
    `Failed to load alt text for image /path/to/image.png. Tried does-not-exist.txt as ${process.cwd()}/does-not-exist.txt`,
  );
});

test("should warn when file does not exist and missingFile is warn", async () => {
  const file = await processFile(
    `# Hello, world!

![file:does-not-exist.txt](/path/to/image.png)`,
    { missingFile: "warn" },
  );

  expect(file.toString().slice(0, -1)).toBe(`# Hello, world!

![file:does-not-exist.txt](/path/to/image.png)`);
  expect(file.messages.map((message) => String(message))).toEqual([
    `1:1: Failed to load alt text for image /path/to/image.png. Tried does-not-exist.txt as ${process.cwd()}/does-not-exist.txt`,
  ]);
});

test("should ignore missing files when missingFile is ignore", async () => {
  const file = await processFile(
    `# Hello, world!

![file:does-not-exist.txt](/path/to/image.png)`,
    { missingFile: "ignore" },
  );

  expect(file.toString().slice(0, -1)).toBe(`# Hello, world!

![file:does-not-exist.txt](/path/to/image.png)`);
  expect(file.messages).toEqual([]);
});

const processFile = async (value: Compatible, options?: PluginArgs) =>
  await remark().use(remarkAltTextFiles, options ?? {}).process(value);

const processMarkdown = async (value: Compatible, options?: PluginArgs) => {
  const processedTree = await processFile(value, options);
  return processedTree.toString().slice(0, -1);
};

const processImage = async (value: Compatible, options?: PluginArgs) => {
  let image: mdast.Image | undefined;
  await remark()
    .use(remarkAltTextFiles, options ?? {})
    .use(() => (tree) => {
      visit(tree, "image", (node) => {
        image = node;
      });
    })
    .process(value);

  if (!image) {
    throw new Error("Expected processed markdown to include an image");
  }

  return image;
};

const getHProperties = (image: mdast.Image) =>
  (
    image.data as
      | (mdast.Image["data"] & { hProperties?: Record<string, unknown> })
      | undefined
  )?.hProperties;
