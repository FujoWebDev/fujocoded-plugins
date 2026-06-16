import { SMALL_WORDS } from "./capitalizations.ts";

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

// Text is scanned into atoms (raw letter/digit runs) => atoms are grouped into
// words => a word holds one or more segments (e.g. "up-to-date" is one
// word of three segments). start/end and startPos/endPos are offsets into the
// original string so casing can be spliced back in place.
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

// How the run of characters *between* two atoms is classified:
// - JOIN: nothing or only transparent chars (`(`, `)`, `*`, `_`, `~`) — the
//   atoms fuse into one segment, e.g. `cat(s)`, `**bold**`, `~~don't~~`.
// - COMPOUND: a single `-` or `/` — a new segment of the *same* word; the
//   first segment caps, later ones stay lowercase ("Up-to-date", "Push/pull").
// - BOUNDARY: anything else (space, punctuation) — starts a new word.
//   forceCap when the gap contains hard-cap punctuation (`:`, `?`, `—`, …).
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

// Walk the atoms, classifying the gap before each one to decide whether it
// fuses into the current segment (JOIN), starts a new compound segment
// (COMPOUND), or begins a new word (BOUNDARY).
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

const isTransparentAt = (text: string, idx: number): boolean => {
  const c = text[idx];
  return c !== undefined && TRANSPARENT.has(c);
};

const firstSegmentOf = (word: Word): Segment => word.segments[0]!;
const lastSegmentOf = (word: Word): Segment =>
  word.segments[word.segments.length - 1]!;

// Expand each word's outer segments to absorb adjacent transparent characters
// so `cat(s)`, `~~don't~~`, and `**only**` ride along as one unit during
// reassembly. Segment offsets are widened in place to cover the delimiters.
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

// Uppercase the first *letter*, skipping leading non-letters so a segment that
// starts with a paren or quote (`(s)omething`) caps the letter, not the symbol.
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

// Final pass: rewrite each special term to its exact casing at every
// word-boundary occurrence (case-insensitive). Runs last, so it overrides the
// position-aware decisions above (see DEFAULT_CAPITALIZATIONS in
// capitalizations.ts).
const applySpecials = (text: string, specials: string[]): string => {
  for (const s of specials) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(s)}\\b`, "gi"), s);
  }
  return text;
};

// Capitalize by following these steps:
// 1. lowercase everything
// 2. parse into atoms => words
// 3. decide per-word capitalization
// 4. splice the cased segments back over the original text
// 5. apply the special-casing post-pass.
//
// isFirstTextNode/isLastTextNode let a
// caller mark whether this string is the start/end of the whole title (a
// heading can arrive as several text nodes).
export const titleCase = (
  input: string,
  options: {
    special: string[];
    isFirstTextNode: boolean;
    isLastTextNode: boolean;
  },
): string => {
  const text = input.toLowerCase();
  const atoms = findAtoms(text);
  const firstAtom = atoms[0];
  // No letters/digits at all (e.g. pure punctuation): nothing to case.
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
    // Capitalization precedence, highest first. The cap-forcing rules are
    // checked before the small-word exception so a small word still caps when
    // it's a compound, follows hard punctuation, or sits in first/last position.
    let shouldCap: boolean;
    if (word.segments.length > 1) {
      shouldCap = true; // compound ("Up-to-date"): always cap the head segment
    } else if (word.forceCap) {
      shouldCap = true; // gap before it had hard-cap punctuation (`:`, `?`, …)
    } else if (isFirst && leadingHasHardCap) {
      shouldCap = true; // hard-cap punctuation led the text node
    } else if (isFirst && options.isFirstTextNode && !leadingHasMultiDot) {
      shouldCap = true; // first word of the title (unless a leading `...`)
    } else if (isLast && options.isLastTextNode) {
      shouldCap = true; // last word of the title always caps
    } else if (SMALL_WORDS.has(firstSegmentOf(word).letters)) {
      shouldCap = false; // small word with none of the above: stays lowercase
    } else {
      shouldCap = true; // ordinary content word
    }

    // Reassemble in original order: emit the untouched text before each segment
    // (spaces, punctuation), then the segment itself, which caps only the head
    // segment of the word so compound tails ("up-to-Date") stay lowercase.
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
