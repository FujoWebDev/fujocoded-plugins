# @fujocoded/remark-capitalize-titles

## 0.1.0

### Minor Changes

- 9439b7a: Lowercase the second-and-later segments of a hyphenated compound during title
  casing, so output follows AP-style ("Three-way Merges", "Pre-commit Hooks",
  "Up-to-date") instead of capitalizing every segment ("Three-Way", "Pre-Commit",
  "Up-To-Date"). A segment is kept capitalized when either the full compound or
  the individual segment is listed in `special`.

  This is a breaking change for callers that expected every segment of a
  hyphenated word to be capitalized.

### Patch Changes

- 9439b7a: Capitalize words correctly when a heading contains curly quotes (as produced by
  `remark-smartypants`). Previously, the upstream `title` library only recognized
  straight quotes as punctuation, so a word following a curly `“` or `’` would
  stay lowercase. The plugin now converts curly quotes to straight quotes before
  title-casing, then restores the original curly characters in the output.
