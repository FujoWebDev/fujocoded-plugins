import { getActionContext } from "astro:actions";
import { type MiddlewareHandler } from "astro";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { action, setActionResult, serializeActionResult } =
    getActionContext(context);

  const latestAction = await context.session?.get(
    `smooth-actions:latest-astro-action`
  );

  if (latestAction) {
    // There was an action result stored in the session, so we can restore it
    // for this request and then delete the session entry. This makes it look
    // like the action was executed on this request, and there was no magic
    // redirect happening behind the scenes.
    setActionResult(latestAction.name, latestAction.result);
    await context.session?.delete(`smooth-actions:latest-astro-action`);
    return next();
  }

  if (action?.calledFrom !== "form") {
    // If the action was not called from a form, we can just move on to the next
    // middleware. This is not this middleware's job to handle.
    return next();
  }

  // If we're here, there was an action called from a form, so we need to execute it. Then we
  // store the result in the session so that it can be restored for the next
  // request.
  const result = await action.handler();
  context.session?.set(`smooth-actions:latest-astro-action`, {
    name: action.name,
    result: serializeActionResult(result),
  });

  if (result.error) {
    // If the action failed, we need to redirect back to the page where the
    // form is located. This is because the form will need to be resubmitted
    // with the error message.
    const referer = context.request.headers.get("Referer");
    if (!referer) {
      throw new Error("Action submission went wrong");
    }
    return context.redirect(referer);
  }

  // If the action succeeded, we can redirect to the original page. This will
  // get rid of the POST request and replace it with a GET request.
  return context.redirect(context.originPathname);
};
