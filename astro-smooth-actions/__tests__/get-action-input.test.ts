import { describe, expect, it } from "vitest";

import {
  createActionQuery,
  getActionQueryParam,
  readActionInput,
} from "./helpers.ts";

describe("getActionInput", () => {
  it("returns input for the matching action key", () => {
    const action = createActionQuery(
      `?${getActionQueryParam()}=actions.subscribe`,
    );
    const locals = {
      lastAction: {
        name: "actions.subscribe",
        input: { email: "bobatan@fujocoded.test" },
      },
    } as {
      lastAction: {
        name: string;
        input: Record<string, string | string[] | null>;
      };
    };

    const input = readActionInput({ locals, action });

    expect(input).toEqual({ email: "bobatan@fujocoded.test" });
  });

  it("returns undefined when names do not match", () => {
    const action = createActionQuery(
      `?${getActionQueryParam()}=actions.subscribe`,
    );
    const locals = {
      lastAction: {
        name: "actions.unsubscribe",
        input: { email: "bobatan@fujocoded.test" },
      },
    } as {
      lastAction: {
        name: string;
        input: Record<string, string | string[] | null>;
      };
    };

    const input = readActionInput({ locals, action });

    expect(input).toBeUndefined();
  });

  it("returns undefined when action query is missing", () => {
    const action = createActionQuery();
    const locals = {
      lastAction: {
        name: "actions.subscribe",
        input: { email: "bobatan@fujocoded.test" },
      },
    } as {
      lastAction: {
        name: string;
        input: Record<string, string | string[] | null>;
      };
    };

    const input = readActionInput({ locals, action });

    expect(input).toBeUndefined();
  });

  it("returns undefined when action query misses the action key", () => {
    const action = createActionQuery("?foo=bar");
    const locals = {
      lastAction: {
        name: "actions.subscribe",
        input: { email: "bobatan@fujocoded.test" },
      },
    } as {
      lastAction: {
        name: string;
        input: Record<string, string | string[] | null>;
      };
    };

    const input = readActionInput({ locals, action });

    expect(input).toBeUndefined();
  });
});
