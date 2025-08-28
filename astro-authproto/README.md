# @fujocoded/authproto

Astro integration to easily authenticate your site visitors using ATproto. For
Bluesky and beyond.

> [!WARNING] This is not ready for prime time, only use it if you know what
> you're doing. Come back soon for instructions for real production usage!

## Current TODOs

- [x] Turn into a proper package
- [x] Check whether you can do unstorage for saving data
- [ ] Write a README
- [ ] Comment the whole Auth files
- [ ] Improve config and make it make sense
- [ ] Figure out how to turn AstroDB into an option
- [ ] Add option to redirect logged in/logged out user to a chosen page
- [ ] Figure out how to make types correctly signal Astro.locals.loggedInUser can be null

// Tip!
Want to see what gets saved by the storage? Use

```
      driver: {
        name: "fs-lite",
        options: {
          base: process.cwd() + "/test/",
        },
      },
```

Make sure not to commit!
