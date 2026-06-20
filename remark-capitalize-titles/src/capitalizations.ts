// Brand and product names with non-standard internal casing.
const FUJOCODED = ["FujoCoded", "FujoWebDev", "FujoGuide"];

const PROGRAMMING = [
  "GitHub",
  "NodeJS",
  "JavaScript",
  "SHA",
  "SHAs",
  "NPM",
  "HTML",
  "CSS",
];

// Acronyms and initialisms that should stay fully uppercase.
const ACRONYMS = ["LLC", "TL;DR"];

// Small words and phrases FujoCoded force-caps even though AP-style rules would
// normally lowercase them mid-title.
const FORCED_PHRASES = ["Next Up", "Mean To", "About", "Through", "Along"];

// FORCED exact casing. Applied as a post-pass where every occurrence is
// rewritten to this exact string, regardless of position.
export const DEFAULT_CAPITALIZATIONS = [
  ...FUJOCODED,
  ...PROGRAMMING,
  ...ACRONYMS,
  ...FORCED_PHRASES,
];

// STAY lowercase mid-title only. Articles, conjunctions, and prepositions that
// the casing pass keeps lowercase *except* when first word, last word, or after
// hard-cap punctuation.
// Sourced from the same set as `vercel/title`.
export const SMALL_WORDS = new Set([
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
