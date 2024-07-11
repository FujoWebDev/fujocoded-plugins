import { definePlugin, AttachedPluginData } from "@expressive-code/core";
import { h } from "@expressive-code/core/hast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toHast } from "mdast-util-to-hast";

interface CaptionData {
  caption?: string;
}
const captionData = new AttachedPluginData<CaptionData>(() => ({}));

export function pluginCodeCaption() {
  return definePlugin({
    name: "Code caption",
    baseStyles: `
      figure:last-child {
        background-color: black;
      }`,
    hooks: {
      preprocessCode: (context) => {
        const allLines = [...context.codeBlock.getLines()];
        if (allLines.length && allLines[allLines.length - 1]?.text !== "---") {
          return;
        }
        const captionStartLine = allLines.findLastIndex((line, index) => {
          // Let's skip the actual last match
          if (index === allLines.length - 1) return false;
          return line.text === "---";
        });
        if (!captionStartLine) return;

        const blockData = captionData.getOrCreateFor(context.codeBlock);
        blockData.caption = allLines
          .slice(captionStartLine + 1, allLines.length - 1)
          .map((line) => line.text)
          .join("\n");

        for (let i = allLines.length; i > captionStartLine; i--) {
          // Do this in reverse direction so there's no issue with line numbers
          // changing as we delete lines
          context.codeBlock.deleteLine(i - 1);
        }
        // Also delete the last line if it remains empty

        if (context.codeBlock.getLines().length > 0) {
          const lastLine =
            context.codeBlock.getLines()[
              context.codeBlock.getLines().length - 1
            ];
          if (lastLine && lastLine.text.trim() === "") {
            context.codeBlock.deleteLine(
              context.codeBlock.getLines().length - 1
            );
          }
        }
      },
      postprocessRenderedBlock: async (context) => {
        const blockData = captionData.getOrCreateFor(context.codeBlock);
        if (!blockData.caption) return;
        context.renderData.blockAst.children.push(
          h("figcaption", toHast(fromMarkdown(blockData.caption)))
        );
      },
    },
  });
}
