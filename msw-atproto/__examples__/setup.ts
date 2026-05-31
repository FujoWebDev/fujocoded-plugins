import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./msw/server.ts";

vi.mock("node:dns/promises", async (importActual) => {
  // In your own project, replace this relative import with:
  // const { createDnsMock } = await import("@fujocoded/msw-atproto");
  const { createDnsMock } = await import("../src/index.ts");
  return createDnsMock(importActual);
});

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(async () => {
  server.resetHandlers();
});
afterAll(() => server.close());
