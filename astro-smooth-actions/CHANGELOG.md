# @fujocoded/astro-smooth-actions

## 0.0.1

### Patch Changes

- [`9fa3df4`](https://github.com/FujoWebDev/fujocoded-plugins/commit/9fa3df4eb465564b92d950b2253bd09c715ee651) Thanks [@essential-randomness](https://github.com/essential-randomness)!

  Initial release of `@fujocoded/astro-smooth-actions`, an Astro integration that makes native form Actions use a POST/Redirect/GET flow without client-side JavaScript.

  This release includes production middleware for storing serialized action results in Astro session storage, restoring them on the redirected page load, clearing short-lived session cookies after use, and falling back to Astro's normal behavior when sessions or action helpers are unavailable.

  It also adds `getActionInput()` for reading back submitted form fields after a redirect, configurable input storage exclusions, hidden form controls for omitting sensitive fields or whole forms, type injection for `Astro.locals.lastAction`, runnable Astro 5/6/7 examples, unit tests, and Playwright coverage for the native form flow.
