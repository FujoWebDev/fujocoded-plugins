import { expect, test, describe } from "vitest";
import { select } from "hast-util-select";
import {
  convertToHtml,
  extractCodeBlockAndOutput,
  getExpressiveCodeEngine,
} from "./utils.ts";

const codeWithOutput = `> def foo():
>     for i in range(5):
>         print("This is the index ", i)
> foo()
This is the index  0
This is the index  1
This is the index  2
This is the index  3
This is the index  4`;

const regularCode = `This is just regular code!`;

const codeWithEmptyOutput = `> mkdir test`;

describe("Code with output", async () => {
  const engine = getExpressiveCodeEngine();
  const result = await engine.render({
    code: codeWithOutput,
    language: "python",
    meta: "withOutput",
  });

  const tree = result.renderedGroupAst;
  const { codeBlock, outputBlock } = extractCodeBlockAndOutput(tree);

  test("Renders code block correctly", async () => {
    expect(convertToHtml(codeBlock)).toMatchInlineSnapshot(/*html*/ `
    "<pre data-language="python">
      <code>
        <div class="ec-line">
          <div class="code">
            def foo():
          </div>
        </div>
        <div class="ec-line">
          <div class="code">
            <span class="indent">
            </span>
            for i in range(5):
          </div>
        </div>
        <div class="ec-line">
          <div class="code">
            <span class="indent">
            </span>
            print("This is the index ", i)
          </div>
        </div>
        <div class="ec-line">
          <div class="code">
            foo()
          </div>
        </div>
      </code>
    </pre>"
  `);
  });

  test("Renders output correctly", async () => {
    expect(convertToHtml(outputBlock)).toMatchInlineSnapshot(/*html*/ `
    "<pre class="output">
      <div>
        This is the index  0
      </div>
      <div>
        This is the index  1
      </div>
      <div>
        This is the index  2
      </div>
      <div>
        This is the index  3
      </div>
      <div>
        This is the index  4
      </div>
    </pre>"
  `);
  });
});

test("Code with copy button", async () => {
  const engine = getExpressiveCodeEngine({ showCopyToClipboardButton: true });
  const result = await engine.render({
    code: codeWithOutput,
    language: "python",
    meta: "withOutput",
  });

  const copyButton = select("div.copy button", result.renderedGroupAst);
  // Note this shouldn't have the output in it
  expect(copyButton?.properties.dataCode).toBe(
    `def foo():\x7F    for i in range(5):\x7F        print("This is the index ", i)\x7Ffoo()`
  );
});

describe("Code with empty output", async () => {
  const engine = getExpressiveCodeEngine();
  const result = await engine.render({
    code: codeWithEmptyOutput,
    language: "bash",
    meta: "withOutput",
  });

  const tree = result.renderedGroupAst;
  const { outputBlock, codeBlock } = extractCodeBlockAndOutput(tree);

  test("Renders code block correctly", async () => {
    expect(convertToHtml(codeBlock)).toMatchInlineSnapshot(/*html*/ `
      "<pre data-language="bash">
        <code>
          <div class="ec-line">
            <div class="code">
              mkdir test
            </div>
          </div>
        </code>
      </pre>"
    `);
  });

  test("Renders empty output correctly", async () => {
    expect(convertToHtml(outputBlock)).toBeNull();
  });
});

describe("Regular code as output", async () => {
  const engine = getExpressiveCodeEngine();
  const result = await engine.render({
    code: regularCode,
    language: "python",
    meta: "withOutput",
  });

  const tree = result.renderedGroupAst;
  const { outputBlock, codeBlock } = extractCodeBlockAndOutput(tree);

  test("Renders code as output block", async () => {
    expect(convertToHtml(outputBlock)).toMatchInlineSnapshot(/*html*/ `
      "<pre class="output">
        <div>
          This is just regular code!
        </div>
      </pre>"
    `);
  });

  test("Renders empty code block", async () => {
    expect(convertToHtml(codeBlock)).toMatchInlineSnapshot(/*html*/ `
      "<pre data-language="python">
        <code>
        </code>
      </pre>"
    `);
  });
});

test("Preserves code when no meta is provided", async () => {
  const engine = getExpressiveCodeEngine();
  const result = await engine.render({
    code: codeWithOutput,
    language: "python",
  });

  const tree = result.renderedGroupAst;
  expect(convertToHtml(tree)).toMatchInlineSnapshot(/*html*/ `
    "<div class="expressive-code">
      <figure class="frame">
        <figcaption class="header">
        </figcaption>
        <pre data-language="python">
          <code>
            <div class="ec-line">
              <div class="code">
                > def foo():
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                >     for i in range(5):
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                >         print("This is the index ", i)
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                > foo()
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                This is the index  0
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                This is the index  1
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                This is the index  2
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                This is the index  3
              </div>
            </div>
            <div class="ec-line">
              <div class="code">
                This is the index  4
              </div>
            </div>
          </code>
        </pre>
      </figure>
    </div>"
  `);
});
