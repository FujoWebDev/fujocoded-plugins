`@fujocoded/astro-smooth-actions`

A quick integration to make Astro Action smoother, even when used without
client-side JavaScript.

When installed, it automatically persists <u>form</u> action results in the
session, preventing URL changes and form resubmission dialogs. and providing a
smooth user experience

If you don't know what any of this means, you should likely install this if:

- use Astro Actions with Forms
- [have access to session storage](https://docs.astro.build/en/guides/sessions/)
- want your forms to work smoothly without client side JavaScript, .

## How It Works

> [!NOTE]
>
> In practice, this integration wraps the pattern described in ["Advanced:
> Persist action results with a
> session"](https://docs.astro.build/en/guides/actions/#advanced-persist-action-results-with-a-session)
> into an installable plugin.

This integration implements the [POST/Redirect/GET
pattern](https://docs.astro.bu
ild/en/guides/actions/#advanced-persist-action-results-with-a-session):

1. Form submission (with form payload) is intercepted by its middleware
2. Action is executed on the server
3. Result is stored in the session
4. User is redirected back to original page (without form payload)
5. New page load retrieves result from session
6. Result is cleared from session
7. Page is displayed to the user

Since this final page is just a regular page with no form submission data, the
user avoids all the issues associated with pages resulting from form requests.
