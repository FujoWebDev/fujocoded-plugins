// Backs the `fujocoded:authproto/stores` virtual module via vitest.config.ts.
// auth.ts:createClient instantiates these for the NodeOAuthClient's
// state and session storage. `resetTestStores` is called from setup.ts
// between tests to keep stores isolated.

type StoreValue = unknown;

const states = new Map<string, StoreValue>();
const sessions = new Map<string, StoreValue>();

export const getTestStateAppState = (
  state: string | null | undefined,
): string | undefined => {
  if (!state) {
    return undefined;
  }

  const value = states.get(state);
  if (
    typeof value === "object" &&
    value !== null &&
    "appState" in value &&
    typeof value.appState === "string"
  ) {
    return value.appState;
  }

  return undefined;
};

export const resetTestStores = () => {
  states.clear();
  sessions.clear();
};

export class StateStore {
  async get(key: string) {
    return states.get(key);
  }

  async set(key: string, value: StoreValue) {
    states.set(key, value);
  }

  async del(key: string) {
    states.delete(key);
  }
}

export class SessionStore {
  async get(did: string) {
    return sessions.get(did);
  }

  async set(did: string, value: StoreValue) {
    sessions.set(did, value);
  }

  async del(did: string) {
    sessions.delete(did);
  }
}
