# @fujocoded/remark-capitalize-titles

## 0.2.0

### Minor Changes

- [`41f6902`](https://github.com/FujoWebDev/fujocoded-plugins/commit/41f690219a272eb70e544cda713ce8f0e565f1e6) Thanks [@essential-randomness](https://github.com/essential-randomness)!

  Capitalize Astro frontmatter `title` fields by default, with a `frontmatterTitle: false` option for callers that only want Markdown heading capitalization. Also preserve `NodeJS` as a default capitalization.

### Patch Changes

- Export `capitalizeTitle` for title-casing a standalone string outside a Markdown
  tree: pass the title, an optional `{ special }` override, and have your Markdown
  string capitalized while preserving inline code, emphasis, and escapes.

  Component `title` props now run through this same Markdown path, so inline
  code spans inside a title keep their exact casing instead of being lowercased.

  Also extends the default capitalization list with `JavaScript`, `HTML`, and
  `CSS`.

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
