import { vi } from "vitest";

import type { SerializedActionResult } from "astro/actions/runtime/shared.js";
import { getActionInput, onRequest } from "../src/middleware.ts";
import {
  getActionQueryParam,
  setActionContext,
  type MockActionContext,
} from "./setup.ts";

export {
  addExcludedFields,
  getActionQueryParam,
  setActionContext,
  setExcludedActions,
} from "./setup.ts";
export type { MockActionContext } from "./setup.ts";

export const runMiddleware = (
  ...args: Parameters<typeof onRequest>
): ReturnType<typeof onRequest> => onRequest(...args);

export const readActionInput = (
  ...args: Parameters<typeof getActionInput>
): ReturnType<typeof getActionInput> => getActionInput(...args);

export const createFormAction = ({
  handler,
  name = "actions.subscribe",
}: {
  handler: () => Promise<unknown>;
  name?: string;
}): NonNullable<MockActionContext["action"]> => ({
  name,
  calledFrom: "form",
  queryString: `?${getActionQueryParam()}=${name}`,
  handler,
});

export const createActionQuery = (
  queryString?: string,
): Parameters<typeof getActionInput>[0]["action"] => ({ queryString });

export const createMemorySession = (seed: Record<string, unknown> = {}) => {
  const values = new Map<string, unknown>(Object.entries(seed));
  const get = vi.fn(async (key: string) => values.get(key));
  const set = vi.fn((key: string, value: unknown) => {
    values.set(key, value);
  });
  const del = vi.fn((key: string) => {
    values.delete(key);
  });

  return { get, set, delete: del, values };
};

export const createCookieJar = () => {
  const values = new Map<string, string>();
  const setOptions = new Map<string, unknown>();
  const deleteOptions = new Map<string, unknown>();
  const deleted: string[] = [];
  const set = (name: string, value: string, options?: unknown) => {
    values.set(name, value);
    setOptions.set(name, options);
  };
  const get = (name: string) => {
    const value = values.get(name);
    return value === undefined ? undefined : { value };
  };
  const del = (name: string, options?: unknown) => {
    values.delete(name);
    deleteOptions.set(name, options);
    deleted.push(name);
  };

  return { values, setOptions, deleteOptions, deleted, set, get, delete: del };
};

export const createContext = ({
  request,
  session,
  originPathname = "/",
  isPrerendered = false,
}: {
  request: Request;
  session?: ReturnType<typeof createMemorySession>;
  originPathname?: string;
  isPrerendered?: boolean;
}) => {
  const cookies = createCookieJar();
  const next = vi.fn(async () => new Response("next"));
  const redirect = vi.fn(
    (to: string) =>
      new Response(null, { status: 303, headers: { Location: to } }),
  );

  const context = {
    locals: {},
    session: session,
    request,
    url: new URL(request.url),
    isPrerendered,
    originPathname,
    redirect,
    cookies,
  } as unknown as Parameters<typeof onRequest>[0];

  return { context, cookies, next, redirect };
};

export const getStoredActionInput = ({
  session,
  cookies,
}: {
  session: ReturnType<typeof createMemorySession>;
  cookies: ReturnType<typeof createCookieJar>;
}) => {
  const cookieId = cookies.values.get("astro-smooth-action-session");
  const stored = session.values.get(`smooth-actions:${cookieId}`) as
    | { input?: Record<string, string | string[] | null> }
    | undefined;

  return stored?.input;
};

export const runFormActionPost = async ({
  url = "https://app.fujocoded.test/subscribe",
  originPathname = new URL(url).pathname,
  session = createMemorySession(),
  formData = new FormData(),
  headers,
  actionName = "actions.subscribe",
  result = { ok: true },
  handler = vi.fn(async () => result),
  serializeActionResult = (value: unknown) => value as SerializedActionResult,
}: {
  url?: string;
  originPathname?: string;
  session?: ReturnType<typeof createMemorySession>;
  formData?: FormData;
  headers?: HeadersInit;
  actionName?: string;
  result?: unknown;
  handler?: () => Promise<unknown>;
  serializeActionResult?: (value: unknown) => SerializedActionResult;
} = {}) => {
  const request = new Request(url, {
    method: "POST",
    body: formData,
    headers,
  });
  const { context, next, cookies } = createContext({
    request,
    session,
    originPathname,
  });
  const action = createFormAction({ handler, name: actionName });

  setActionContext({
    context,
    value: {
      action,
      serializeActionResult,
    },
  });

  await onRequest(context, next);

  return { action, context, cookies, next, session };
};

export const getStoredActionEntry = (
  session: ReturnType<typeof createMemorySession>,
) =>
  vi.mocked(session.set).mock.calls[0]?.[1] as
    | {
        name: string;
        result: SerializedActionResult;
        input?: Record<string, string | string[] | null>;
      }
    | undefined;
