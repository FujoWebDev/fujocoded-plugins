declare module "astro:actions" {
  export * from "astro/actions/runtime/server.js";
}

type ActionInput = Record<string, string | string[] | null>;

type ActionSessionEntry = {
  name: string;
  result: ReturnType<
    NonNullable<
      ReturnType<
        typeof import("astro:actions").getActionContext
      >["serializeActionResult"]
    >
  >;
  input?: ActionInput;
};

type LastAction = {
  name: string;
  input: ActionInput;
};

declare namespace App {
  interface Locals {
    lastAction?: LastAction;
  }

  interface SessionData {
    [key: `smooth-actions:${string}`]: ActionSessionEntry | undefined;
  }
}
