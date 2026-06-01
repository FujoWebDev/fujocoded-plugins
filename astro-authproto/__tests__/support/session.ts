export type TestSession = {
  get(key: string): Promise<any>;
  set(key: string, value: unknown): void | Promise<void>;
  delete(key: string): void | Promise<void>;
};

export const createSession = (): TestSession => {
  const values = new Map<string, unknown>();

  return {
    async get(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
    delete(key) {
      values.delete(key);
    },
  };
};

export const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { location },
  });
