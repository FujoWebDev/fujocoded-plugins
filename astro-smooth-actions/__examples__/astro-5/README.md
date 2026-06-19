# Astro 5 example for `astro-smooth-actions`

This folder contains a minimal Astro 5 app that demonstrates:

- `defineAction` form submission with `accept: "form"`
- `astroSmoothActions()` integration in `astro.config.mjs`
- `Astro.getActionResult()` for action success/error messaging

## Run it

```bash
cd __examples__/astro-5
npm install
npm run dev
```

Open <http://localhost:4321> and submit the form.

Behavior notes:

- Submitting an email ending in `@blocked.test` returns a custom error in action data.
- On validation errors, the package stores the result from the action so the page can render error messaging after the redirect.
