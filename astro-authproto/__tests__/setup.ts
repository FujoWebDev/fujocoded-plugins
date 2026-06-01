import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { resetParRequests, server } from "./support/msw.ts";
import { resetTestStores } from "./virtual/stores.ts";

vi.mock("node:dns/promises", async (importActual) => {
  const { createDnsMock } = await import("@fujocoded/msw-atproto");
  return createDnsMock(importActual);
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  resetParRequests();
  resetTestStores();
});

afterAll(() => {
  server.close();
});
