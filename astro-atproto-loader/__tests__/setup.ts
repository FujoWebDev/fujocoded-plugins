import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server.ts";

vi.mock("node:dns/promises", () => {
  const fail = async () => {
    throw Object.assign(new Error("ENODATA (test stub)"), { code: "ENODATA" });
  };
  return {
    default: {
      resolveTxt: fail,
      lookup: fail,
      Resolver: class {
        setServers() {}
        resolveTxt = fail;
      },
    },
  };
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
