import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

import type mdast from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

import { DEFAULT_CAPITALIZATIONS as DEFAULT_CAPITALIZATIONS_ } from "./capitalizations.ts";

// Articles, conjunctions, and prepositions that stay lowercase mid-title
// (AP-style title casing). Sourced from the same set as `vercel/title`.
const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "aboard",
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "amid",
  "among",
  "anti",
  "around",
  "as",
  "at",
  "before",
  "behind",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "yet",
  "so",
  "below",
  "beneath",
  "beside",
  "besides",
  "between",
  "beyond",
  "by",
  "concerning",
  "considering",
  "despite",
  "down",
  "during",
  "except",
  "excepting",
  "excluding",
  "following",
  "from",
  "in",
  "inside",
  "into",
  "like",
  "minus",
  "near",
  "of",
  "off",
  "on",
  "onto",
  "opposite",
  "over",
  "past",
  "per",
  "plus",
  "regarding",
  "round",
  "save",
  "since",
  "than",
  "through",
  "to",
  "toward",
  "towards",
  "under",
  "underneath",
  "unlike",
  "until",
  "up",
  "upon",
  "versus",
  "via",
  "with",
  "within",
  "without",
]);

// Characters that ride along with an adjacent word but don't break it:
// Markdown inline delimiters (`~~strike~~`, `**bold**`, `_em_`) and parens.
const TRANSPARENT = new Set(["(", ")", "*", "_", "~"]);

// Joiners that fuse atoms into a single compound word with multiple
// segments. The first segment gets capitalized; later segments stay
// lowercase (AP style: "Three-way", "Up-to-date", "Push/pull").
const COMPOUND_JOINERS = new Set(["-", "/"]);

// Punctuation that, when present in the gap between two atoms, force-caps
// the next word even if it would otherwise be small.
const HARD_CAP = new Set([":", ";", "!", "?", "—", "–"]);

// An atom is a maximal run of letters/digits with optional intra-word
// apostrophes (straight or curly). Required to start with a letter/digit
// so a leading quote doesn't get absorbed into the word.
const ATOM_RE = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

interface Atom {
  start: number;
  end: number;
  value: string;
}

interface Segment {
  startPos: number;
  endPos: number;
  letters: string;
}

interface Word {
  segments: Segment[];
  forceCap: boolean;
}

const findAtoms = (text: string): Atom[] => {
  const atoms: Atom[] = [];
  for (const m of text.matchAll(ATOM_RE)) {
    atoms.push({
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
    });
  }
  return atoms;
};

type GapKind = "JOIN" | "COMPOUND" | "BOUNDARY";

const classifyGap = (gap: string): { kind: GapKind; forceCap: boolean } => {
  if (gap.length === 0) return { kind: "JOIN", forceCap: false };
  let allTransparent = true;
  for (const c of gap) {
    if (!TRANSPARENT.has(c)) {
      allTransparent = false;
      break;
    }
  }
  if (allTransparent) return { kind: "JOIN", forceCap: false };
  if (gap.length === 1 && COMPOUND_JOINERS.has(gap)) {
    return { kind: "COMPOUND", forceCap: false };
  }
  for (const c of gap) {
    if (HARD_CAP.has(c)) return { kind: "BOUNDARY", forceCap: true };
  }
  return { kind: "BOUNDARY", forceCap: false };
};

const buildWords = (text: string, atoms: Atom[]): Word[] => {
  const [first, ...rest] = atoms;
  if (!first) return [];
  const newSegment = (a: Atom): Segment => ({
    startPos: a.start,
    endPos: a.end,
    letters: a.value,
  });
  const words: Word[] = [];
  let currSeg = newSegment(first);
  let currWord: Word = { segments: [currSeg], forceCap: false };
  let prev = first;
  for (const curr of rest) {
    const gap = classifyGap(text.slice(prev.end, curr.start));
    if (gap.kind === "JOIN") {
      currSeg.endPos = curr.end;
      currSeg.letters += curr.value;
    } else if (gap.kind === "COMPOUND") {
      currSeg = newSegment(curr);
      currWord.segments.push(currSeg);
    } else {
      words.push(currWord);
      currSeg = newSegment(curr);
      currWord = { segments: [currSeg], forceCap: gap.forceCap };
    }
    prev = curr;
  }
  words.push(currWord);
  return words;
};

// Expand each word's outer segments to absorb adjacent transparent
// characters so `cat(s)`, `~~don't~~`, and `**only**` ride along as one
// unit during reassembly.
const isTransparentAt = (text: string, idx: number): boolean => {
  const c = text[idx];
  return c !== undefined && TRANSPARENT.has(c);
};

const firstSegmentOf = (word: Word): Segment => word.segments[0]!;
const lastSegmentOf = (word: Word): Segment =>
  word.segments[word.segments.length - 1]!;

const attachTransparent = (text: string, words: Word[]): void => {
  const firstWord = words[0];
  if (!firstWord) return;
  const firstSeg = firstSegmentOf(firstWord);
  let i = firstSeg.startPos - 1;
  while (i >= 0 && isTransparentAt(text, i)) i--;
  firstSeg.startPos = i + 1;
  const lastSeg = lastSegmentOf(words[words.length - 1]!);
  let j = lastSeg.endPos;
  while (j < text.length && isTransparentAt(text, j)) j++;
  lastSeg.endPos = j;
  for (let w = 0; w < words.length - 1; w++) {
    const leftSeg = lastSegmentOf(words[w]!);
    const rightSeg = firstSegmentOf(words[w + 1]!);
    let k = leftSeg.endPos;
    while (k < rightSeg.startPos && isTransparentAt(text, k)) k++;
    leftSeg.endPos = k;
    let l = rightSeg.startPos - 1;
    while (l >= leftSeg.endPos && isTransparentAt(text, l)) l--;
    rightSeg.startPos = l + 1;
  }
};

const capFirstLetter = (s: string): string => {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c && /\p{L}/u.test(c)) {
      return s.slice(0, i) + c.toUpperCase() + s.slice(i + 1);
    }
  }
  return s;
};

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applySpecials = (text: string, specials: string[]): string => {
  for (const s of specials) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(s)}\\b`, "gi"), s);
  }
  return text;
};

interface TitleOptions {
  special: string[];
  isFirstTextNode: boolean;
  isLastTextNode: boolean;
}

const titleCase = (input: string, options: TitleOptions): string => {
  const text = input.toLowerCase();
  const atoms = findAtoms(text);
  const firstAtom = atoms[0];
  if (!firstAtom) return applySpecials(text, options.special);
  const words = buildWords(text, atoms);
  attachTransparent(text, words);

  const leadingText = text.slice(0, firstAtom.start);
  // A leading ellipsis (`...and more`) signals a continuation, so the
  // first-word force-cap is suppressed and small-word rules apply normally.
  const leadingHasMultiDot = /\.{2,}/.test(leadingText);
  const leadingHasHardCap = Array.from(HARD_CAP).some((c) =>
    leadingText.includes(c),
  );

  const out: string[] = [];
  let cursor = 0;
  words.forEach((word, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === words.length - 1;
    let shouldCap: boolean;
    if (word.segments.length > 1) {
      shouldCap = true;
    } else if (word.forceCap) {
      shouldCap = true;
    } else if (isFirst && leadingHasHardCap) {
      shouldCap = true;
    } else if (isFirst && options.isFirstTextNode && !leadingHasMultiDot) {
      shouldCap = true;
    } else if (isLast && options.isLastTextNode) {
      shouldCap = true;
    } else if (SMALL_WORDS.has(firstSegmentOf(word).letters)) {
      shouldCap = false;
    } else {
      shouldCap = true;
    }

    word.segments.forEach((seg, segIdx) => {
      out.push(text.slice(cursor, seg.startPos));
      let segStr = text.slice(seg.startPos, seg.endPos);
      if (shouldCap && segIdx === 0) segStr = capFirstLetter(segStr);
      out.push(segStr);
      cursor = seg.endPos;
    });
  });
  out.push(text.slice(cursor));
  return applySpecials(out.join(""), options.special);
};

type PluginArgs = { special: string[]; componentNames: string[] };
// We match command parameters of the form --flag [parameter_name]
const CODE_REGEX = /(`[a-z0-9_\-\s]+`)/gi;

const plugin: Plugin<PluginArgs[], mdast.Root> =
  (
    { special, componentNames }: PluginArgs = {
      special: DEFAULT_CAPITALIZATIONS_,
      componentNames: [],
    },
  ) =>
  (tree) => {
    visit(tree, "heading", (node) => {
      const textNodes: { value?: string }[] = [];
      visit(node, "text", (textNode) => {
        textNodes.push(textNode);
      });
      textNodes.forEach((textNode, i) => {
        textNode.value = titleCase(textNode.value ?? "", {
          special,
          isFirstTextNode: i === 0,
          isLastTextNode: i === textNodes.length - 1,
        });
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
            (attribute) => "name" in attribute && attribute.name == "title",
          );
          if (titleAttribute) {
            const parts = (titleAttribute.value as string).split(
              new RegExp(CODE_REGEX),
            );
            titleAttribute.value = parts
              .map((part, idx) => {
                if (part.startsWith("`") && part.endsWith("`")) return part;
                return titleCase(part, {
                  special,
                  isFirstTextNode: idx === 0,
                  isLastTextNode: idx === parts.length - 1,
                });
              })
              .join("");
          }
        },
      );
    }
  };

export default plugin;

export const DEFAULT_CAPITALIZATIONS = DEFAULT_CAPITALIZATIONS_;
