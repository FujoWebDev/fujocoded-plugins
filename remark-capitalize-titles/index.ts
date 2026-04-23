import { default as libraryTitle } from "title";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

import { DEFAULT_CAPITALIZATIONS as DEFAULT_CAPITALIZATIONS_ } from "./capitalizations.ts";

// Astro's MDX integration runs remark-smartypants before user plugins, so
// straight quotes arrive here as curly. The `title` library's regex only lists
// straight quotes as punctuation, so curly quotes would otherwise prevent the
// next word from being capitalized.
const CURLY_TO_STRAIGHT: Record<string, string> = {
  "\u201C": '"',
  "\u201D": '"',
  "\u2018": "'",
  "\u2019": "'",
};
const CURLY_QUOTE_REGEX = /[\u201C\u201D\u2018\u2019]/g;

// Matches a hyphenated compound like "Three-Way" or "Up-To-Date" so the
// second-and-later segments can be lowercased (AP-style: "Three-way").
const HYPHENATED_COMPOUND_REGEX = /[A-Za-z][A-Za-z']*(?:-[A-Za-z][A-Za-z']*)+/g;

const lowercaseHyphenatedTails = (text: string, special: string[]) =>
  text.replace(HYPHENATED_COMPOUND_REGEX, (match) => {
    if (special.includes(match)) return match;
    const parts = match.split("-");
    return parts
      .map((part, index) => {
        if (index === 0) return part;
        if (special.includes(part)) return part;
        return part.charAt(0).toLowerCase() + part.slice(1);
      })
      .join("-");
  });

const title = (...params: Parameters<typeof libraryTitle>) => {
  const [text, options] = params;
  const curlyPositions: Array<[number, string]> = [];
  const normalized = text.replace(
    CURLY_QUOTE_REGEX,
    (match, offset: number) => {
      curlyPositions.push([offset, match]);
      return CURLY_TO_STRAIGHT[match] ?? match;
    },
  );
  const textChunks = normalized.split(")");
  const titleCased = textChunks
    .map((chunk) => libraryTitle(chunk, options))
    .join(")");
  const intermediateTitle = lowercaseHyphenatedTails(
    titleCased,
    options?.special ?? [],
  );
  if (curlyPositions.length === 0) return intermediateTitle;
  const chars = intermediateTitle.split("");
  for (const [offset, original] of curlyPositions) {
    chars[offset] = original;
  }
  return chars.join("");
};

type PluginArgs = { special: string[]; componentNames: string[] };
// We match command parameters of the form --flag [parameter_name]
const CODE_REGEX = /(\`[a-z0-9_\-\s]+\`)/gi;

const plugin: Plugin<PluginArgs[], mdast.Root> =
  (
    { special, componentNames = [] }: PluginArgs = {
      special: DEFAULT_CAPITALIZATIONS_,
      componentNames: [],
    }
  ) =>
  (tree) => {
    visit(tree, "heading", (node) => {
      visit(node, "text", (textNode) => {
        textNode.value = title(textNode.value ?? "", { special });
      });
    });
    if (componentNames.length > 0) {
      visit(
        tree,
        (node): node is MdxJsxFlowElement => {
          return (
            node.type == "mdxJsxFlowElement" &&
            "name" in node &&
            componentNames.includes(node.name as string)
          );
        },
        (node) => {
          const titleAttribute = node.attributes.find(
            (attribute) => "name" in attribute && attribute.name == "title"
          );
          if (titleAttribute) {
            const titleWithSplitCode = (titleAttribute.value as string).split(
              new RegExp(CODE_REGEX)
            );
            titleAttribute.value = titleWithSplitCode
              .map((part, index) => {
                if (part.startsWith("`") && part.endsWith("`")) {
                  return part;
                  // } else if (index > 0) {
                  //   // If this comes after a code split it will always capitalize the first word,
                  //   // even if it shouldn't be. So, for anything that's not index 0, we add "a"
                  //   // in front of it then remove it so it will treat the first word as it would
                  //   // in the middle of a sentence.
                  //   const intermediateTitle = title("a " + part, { special });
                  //   console.log(intermediateTitle);
                  //   return intermediateTitle.substring(2);
                } else {
                  return title(part, { special });
                }
              })
              .join("");
          }
        }
      );
    }
  };

export default plugin;

export const DEFAULT_CAPITALIZATIONS = DEFAULT_CAPITALIZATIONS_;
