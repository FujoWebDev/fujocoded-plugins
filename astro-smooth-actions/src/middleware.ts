import { ACTION_QUERY_PARAMS, getActionContext } from "astro:actions";
import type { SerializedActionResult } from "astro/actions/runtime/shared.js";
import type { APIContext, MiddlewareHandler } from "astro";
import {
  isInputStorageEnabledForAction,
  readPersistableActionInput,
  type ActionInput,
} from "./input.js";

type ActionSessionEntry = {
  name: string;
  result: SerializedActionResult;
  input?: ActionInput;
};

type ActionContext = ReturnType<typeof getActionContext>;
type ActionContextWithHelpers = ActionContext & {
  setActionResult: NonNullable<ActionContext["setActionResult"]>;
  serializeActionResult: NonNullable<ActionContext["serializeActionResult"]>;
};

const getActionName = (action: {
  queryString?: string;
}): string | undefined => {
  const queryString = "queryString" in action ? action.queryString : undefined;
  if (typeof queryString !== "string") return undefined;
  return (
    new URLSearchParams(queryString.replace(/^\?/, "")).get(
      ACTION_QUERY_PARAMS.actionName,
    ) ?? undefined
  );
};

export function getActionInput({
  locals,
  action,
}: {
  locals: App.Locals;
  action: {
    queryString?: string;
  };
}): ActionInput | undefined {
  const lastAction = locals.lastAction;
  if (!lastAction || lastAction.name !== getActionName(action)) {
    return undefined;
  }
  return lastAction.input;
}

const ACTION_SESSION_COOKIE = "astro-smooth-action-session";
const ACTION_SESSION_TTL_SECONDS = 60;

const getSessionKey = (sessionId: string) => `smooth-actions:${sessionId}`;

const clearActionSessionCookie = (context: APIContext) => {
  context.cookies.delete(ACTION_SESSION_COOKIE, { path: "/" });
};

const getSafeRefererPath = (context: APIContext) => {
  const referer = context.request.headers.get("Referer");
  if (!referer) return context.originPathname;

  try {
    const refererUrl = new URL(referer);
    if (refererUrl.origin !== context.url.origin) {
      return context.originPathname;
    }

    return `${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`;
  } catch {
    return context.originPathname;
  }
};

const isActionSessionEntry = (
  stored: unknown,
): stored is ActionSessionEntry => {
  if (!stored || typeof stored !== "object") return false;

  const candidate = stored as Partial<ActionSessionEntry>;

  if (typeof candidate.name !== "string") {
    return false;
  }
  if (candidate.result === undefined) {
    return false;
  }
  if (candidate.input === undefined) return true;

  return (
    typeof candidate.input === "object" &&
    candidate.input !== null &&
    !Array.isArray(candidate.input)
  );
};

const readStoredAction = async ({
  session,
  sessionId,
}: {
  session: NonNullable<APIContext["session"]>;
  sessionId: string;
}): Promise<ActionSessionEntry | undefined> => {
  try {
    const stored = await session.get(getSessionKey(sessionId));
    if (isActionSessionEntry(stored)) {
      return stored;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const deleteStoredAction = ({
  session,
  sessionId,
}: {
  session: NonNullable<APIContext["session"]>;
  sessionId: string;
}) => {
  try {
    session.delete(getSessionKey(sessionId));
  } catch {
    // Best-effort cleanup; session backends can fail transiently.
  }
};

const writeStoredAction = ({
  context,
  actionName,
  result,
  input,
}: {
  context: APIContext;
  actionName: string;
  result: SerializedActionResult;
  input?: ActionInput;
}): string | undefined => {
  if (!context.session) return undefined;

  const newSessionId = crypto.randomUUID();

  try {
    context.session.set(getSessionKey(newSessionId), {
      name: actionName,
      result,
      input,
    });
    context.cookies.set(ACTION_SESSION_COOKIE, newSessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: ACTION_SESSION_TTL_SECONDS,
    });
    return newSessionId;
  } catch {
    return undefined;
  }
};

const hasActionHelpers = (
  actionContext: ActionContext,
): actionContext is ActionContextWithHelpers =>
  typeof actionContext.setActionResult === "function" &&
  typeof actionContext.serializeActionResult === "function";

const hasActionError = (result: unknown) =>
  typeof result === "object" && result !== null && "error" in result;

/**
 * Runs the POST/Redirect/GET flow for form actions.
 *
 * Three paths through a request:
 *
 * - Returning GET (our cookie is set) => restore the stored result and input,
 *   clear the cookie and session entry, then continue
 * - Form action POST => run the action, store its result and form fields, then
 *   redirect to a clean page (the page they came from on error, otherwise the
 *   current path)
 * - Anything else => continue untouched
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  if (context.isPrerendered) {
    return next();
  }

  const actionContext = getActionContext(context);
  const { action } = actionContext;
  const canPersist = hasActionHelpers(actionContext);

  if (!context.session) {
    clearActionSessionCookie(context);
    return next();
  }

  const sessionId = context.cookies.get(ACTION_SESSION_COOKIE)?.value;
  if (sessionId) {
    const stored = await readStoredAction({
      session: context.session,
      sessionId,
    });
    clearActionSessionCookie(context);
    deleteStoredAction({
      session: context.session,
      sessionId,
    });

    if (stored && canPersist) {
      actionContext.setActionResult(stored.name, stored.result);
      if (stored.input !== undefined) {
        context.locals.lastAction = {
          name: stored.name,
          input: stored.input,
        };
      }
      return next();
    }

    return next();
  }

  if (action?.calledFrom === "form" && canPersist) {
    const { serializeActionResult } = actionContext;
    const input = isInputStorageEnabledForAction(action.name)
      ? await readPersistableActionInput(context.request)
      : undefined;
    const result = await action.handler();
    const serializedResult = serializeActionResult(result);
    const newSessionId = writeStoredAction({
      context,
      actionName: action.name,
      result: serializedResult,
      input,
    });

    if (newSessionId === undefined) {
      return next();
    }

    return context.redirect(
      hasActionError(result)
        ? getSafeRefererPath(context)
        : context.originPathname,
    );
  }

  return next();
};
