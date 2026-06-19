import { beforeEach, vi } from "vitest";

import type { SerializedActionResult } from "astro/actions/runtime/shared.js";
import { DEFAULT_EXCLUDED_FIELDS } from "../src/config.ts";

export type MockActionContext = {
  action?: {
    name: string;
    calledFrom: "form";
    queryString: string;
    handler: () => Promise<unknown>;
  };
  setActionResult: (name: string, result: SerializedActionResult) => void;
  serializeActionResult: (value: unknown) => SerializedActionResult;
};

const mockedConstants = vi.hoisted(() => ({
  actionQueryParam: "astro-action",
}));

const mockedConfig = vi.hoisted(() => ({
  value: {
    input: {
      excludeActions: [] as string[],
      excludeFields: [] as string[],
    },
  },
}));

let actionContextMap: WeakMap<
  object,
  Partial<MockActionContext>
> = new WeakMap();

vi.mock("astro:actions", () => ({
  ACTION_QUERY_PARAMS: { actionName: mockedConstants.actionQueryParam },
  getActionContext: (context: object) =>
    actionContextMap.get(context) ?? {
      setActionResult: () => {},
      serializeActionResult: (value: unknown) =>
        value as SerializedActionResult,
    },
}));

vi.mock("fujocoded:astro-smooth-actions/config", () => ({
  astroSmoothActionsConfig: mockedConfig.value,
}));

export const getActionQueryParam = () => mockedConstants.actionQueryParam;

export const setExcludedActions = (excludeActions: string[]) => {
  mockedConfig.value.input.excludeActions = excludeActions;
};

export const addExcludedFields = (excludeFields: string[]) => {
  mockedConfig.value.input.excludeFields = [
    ...mockedConfig.value.input.excludeFields,
    ...excludeFields,
  ];
};

export const setActionContext = ({
  context,
  value,
}: {
  context: object;
  value: Partial<MockActionContext>;
}) => {
  actionContextMap.set(context, {
    setActionResult: () => {},
    serializeActionResult: (value: unknown) => value as SerializedActionResult,
    ...value,
  });
};

beforeEach(() => {
  actionContextMap = new WeakMap();
  mockedConfig.value.input.excludeActions = [];
  mockedConfig.value.input.excludeFields = [...DEFAULT_EXCLUDED_FIELDS];
  vi.clearAllMocks();
});
