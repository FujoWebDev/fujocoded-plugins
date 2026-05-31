import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import {
  createIdentityPassthrough,
  createMockRepoIdentity,
} from "../src/index.ts";
import { DID, HANDLE, PDS } from "./support.ts";
import { server } from "./msw/server.ts";

describe("createIdentityPassthrough", () => {
  type DnsPromisesModule = typeof import("node:dns/promises");

  const buildFakeActual = () => {
    class FakeResolver {
      getServers() {
        return [];
      }
      setServers() {}
      cancel() {}
      resolveTxt() {
        return Promise.resolve([["from-resolver"]]);
      }
    }

    const resolveTxt = (() =>
      Promise.resolve([["from-top-level"]])) as DnsPromisesModule["resolveTxt"];

    return {
      resolveTxt,
      Resolver: FakeResolver,
    } as unknown as DnsPromisesModule;
  };

  it("flips the DNS-stub predicate so selected handles passthrough and the rest stay mocked", async () => {
    const passthrough = createIdentityPassthrough({
      shouldPassthrough: (handle) => handle === "selected.example.test",
    });
    const dns = await passthrough.dnsMock(async () => buildFakeActual());

    await expect(
      dns.resolveTxt("_atproto.mocked.example.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });
    await expect(
      dns.resolveTxt("_atproto.selected.example.test"),
    ).resolves.toEqual([["from-top-level"]]);
  });

  it("well-known handler passthroughs selected hostnames and falls through otherwise", async () => {
    const passthrough = createIdentityPassthrough({
      shouldPassthrough: (handle) => handle === "selected.invalid",
    });
    server.use(
      ...passthrough.handlers,
      http.get("https://mocked.invalid/.well-known/atproto-did", () =>
        HttpResponse.text("did:plc:mocked"),
      ),
      http.get("https://selected.invalid/.well-known/atproto-did", () =>
        HttpResponse.text("did:plc:selected"),
      ),
    );

    await expect(
      fetch("https://mocked.invalid/.well-known/atproto-did").then((response) =>
        response.text(),
      ),
    ).resolves.toBe("did:plc:mocked");
    await expect(
      fetch("https://selected.invalid/.well-known/atproto-did"),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("routes @atproto/identity handle resolution onto the MSW well-known handler", async () => {
    vi.resetModules();
    const passthrough = createIdentityPassthrough();
    vi.doMock("node:dns/promises", passthrough.dnsMock);

    try {
      const { HandleResolver } = await import("@atproto/identity");
      server.use(
        ...passthrough.handlers,
        ...createMockRepoIdentity({
          did: DID,
          handle: HANDLE,
          pds: PDS,
        }).handlers(),
      );

      const resolver = new HandleResolver({ timeout: 50 });

      await expect(resolver.resolve(HANDLE)).resolves.toBe(DID);
    } finally {
      vi.doUnmock("node:dns/promises");
      vi.resetModules();
    }
  });
});
