---
"@fujocoded/remark-capitalize-titles": minor
---

Lowercase the second-and-later segments of a hyphenated compound during title
casing, so output follows AP-style ("Three-way Merges", "Pre-commit Hooks",
"Up-to-date") instead of capitalizing every segment ("Three-Way", "Pre-Commit",
"Up-To-Date"). A segment is kept capitalized when either the full compound or
the individual segment is listed in `special`.

This is a breaking change for callers that expected every segment of a
hyphenated word to be capitalized.
