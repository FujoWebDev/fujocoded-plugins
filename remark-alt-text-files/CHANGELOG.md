# @fujocoded/remark-alt-text-files

## 0.1.0

### Minor Changes

- Adds opt-in source metadata for loaded alt text files. Set `targetAttribute` to
  `true` to write `data-alt-source`, or pass a custom attribute name. Use
  `sourceLocation` to prepend a path or URL, or pass a function when each image
  needs its own source value.

  Adds `missingFile` handling so missing alt text files can error, warn, or be
  ignored. Missing-file messages now name the image and the alt text file path the
  plugin tried to load.
