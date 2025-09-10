import { ExpressiveCodeEngine, pluginFrames } from "astro-expressive-code";
import type { Element, ElementContent } from "hast";
import { toHtml } from "hast-util-to-html";
import { pluginCodeOutput } from "../index.ts";

/**
 * HTML formatters understandably refuse to format <pre> tags,
 * but it makes these tests hard to read. This is a basic formatter
 * that's so simple it's bad (i.e. indents pre).
 */
const formatHtml = (html: string) => {
  let formatted = "";
  let indent = 0;
  const indentStr = "  ";

  html.split(/(<[^>]*>)/).forEach((part) => {
    if (part.trim()) {
      if (part.startsWith("</")) {
        indent = Math.max(0, indent - 1);
      }

      if (part.startsWith("<")) {
        formatted += indentStr.repeat(indent) + part + "\n";
        if (
          !part.startsWith("</") &&
          !part.endsWith("/>") &&
          !["br", "img", "input", "meta", "link"].some((tag) =>
            part.includes(tag)
          )
        ) {
          indent++;
        }
      } else {
        formatted += indentStr.repeat(indent) + part.trim() + "\n";
      }
    }
  });

  return formatted.trim();
};

export const convertToHtml = (ast: ElementContent | null) => {
  if (!ast) return null;
  const root = {
    type: "root" as const,
    children: [ast],
  };

  const html = toHtml(root);
  return formatHtml(html);
};

export const getExpressiveCodeEngine = ({
  showCopyToClipboardButton = false,
} = {}) => {
  return new ExpressiveCodeEngine({
    plugins: [
      // We add the frames plugin to make the test output
      // look like the actual output in Astro
      pluginFrames({ showCopyToClipboardButton }),
      pluginCodeOutput(),
    ],
  });
};

export const extractCodeBlockAndOutput = (element: Element) => {
  // Structure is:
  // <div class="expressive-code">
  //   <figure class="frame">
  //     <figcaption class="header"></figcaption>
  //     <pre data-language="python"> <= this is the code block

  const figureElement = element.children[0];
  if (!figureElement) {
    throw new Error("Figure element not found in code output");
  }
  if (!("children" in figureElement)) {
    throw new Error("Figure element has no children in code output");
  }
  const codeBlockIndex = figureElement.children.findIndex(
    (child) => child.type === "element" && child.tagName === "pre"
  );
  const outputIndex = figureElement.children.findIndex(
    (child, index) =>
      child.type === "element" &&
      child.tagName === "pre" &&
      index > codeBlockIndex,
    codeBlockIndex
  );
  return {
    codeBlock: figureElement.children[codeBlockIndex] ?? null,
    outputBlock:
      outputIndex !== -1 ? (figureElement.children[outputIndex] ?? null) : null,
  };
};
