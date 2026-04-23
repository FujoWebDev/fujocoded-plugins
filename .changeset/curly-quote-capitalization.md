---
"@fujocoded/remark-capitalize-titles": patch
---

Capitalize words correctly when a heading contains curly quotes (as produced by
`remark-smartypants`). Previously, the upstream `title` library only recognized
straight quotes as punctuation, so a word following a curly `“` or `’` would
stay lowercase. The plugin now converts curly quotes to straight quotes before
title-casing, then restores the original curly characters in the output.
