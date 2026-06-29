---
"@fujocoded/remark-capitalize-titles": patch
---

Export `capitalizeTitle` for title-casing a standalone string outside a Markdown
tree: pass the title, an optional `{ special }` override, and have your Markdown
string capitalized while preserving inline code, emphasis, and escapes.

Component `title` props now run through this same Markdown path, so inline
code spans inside a title keep their exact casing instead of being lowercased.

Also extends the default capitalization list with `JavaScript`, `HTML`, and
`CSS`.
