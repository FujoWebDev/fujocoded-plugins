---
"@fujocoded/astro-ao3-loader": patch
---

Support Astro 6 and Astro 7. The `astro` peer dependency now accepts
`^5.0.0 || ^6.0.0 || ^7.0.0`, so npm stops refusing to install the loader
for newer Astro versions.
