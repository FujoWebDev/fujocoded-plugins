import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server.ts";

vi.mock("node:dns/promises", async (importActual) => {
  const { createDnsMock } = await import("@fujocoded/msw-atproto");
  return createDnsMock(importActual);
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());
