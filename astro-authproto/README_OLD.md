# @fujocoded/authproto

Astro integration to easily authenticate your site visitors using ATproto. For
Bluesky and beyond.

> [!WARNING] This is not ready for prime time, only use it if you know what
> you're doing. Come back soon for instructions for real production usage!

## Tidbits

- [ ] Remind folks they need a session configured
- [ ] Remind them not to commit the keys

## Current TODOs

- [x] Turn into a proper package
- [x] Check whether you can do unstorage for saving data
- [ ] Write a README
- [ ] Comment the whole Auth files
- [ ] Improve config and make it make sense
- [x] Figure out how to turn AstroDB into an option
- [x] Add option to redirect logged in/logged out user to a chosen page
- [ ] Explain how to intercept logged out/logged in events so you can do things
- [x] Figure out how to make types correctly signal Astro.locals.loggedInUser can be null
- [x] Fix the state bits in the oauth login route
- [x] Figure out what's up with weird amount of implementations in lib/
- [x] Clean up client-metadata duplication
- [ ] Rename genericData to writeData

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
