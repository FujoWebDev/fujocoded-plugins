import { describe, expect, it } from "vitest";

import { createDnsMock } from "../src/index.ts";
import { createDnsStub } from "../src/dns.ts";

describe("createDnsStub", () => {
  type DnsPromisesModule = typeof import("node:dns/promises");

  const buildFakeActual = () => {
    const topLevelCalls: string[] = [];
    const setServersCalls: string[][] = [];
    const resolverCalls: string[] = [];

    class FakeResolver {
      setServers(servers: readonly string[]) {
        setServersCalls.push([...servers]);
      }
      resolveTxt(hostname: string) {
        resolverCalls.push(hostname);
        return Promise.resolve([["from-resolver"]]);
      }
    }

    const resolveTxt = ((hostname: string) => {
      topLevelCalls.push(hostname);
      return Promise.resolve([["from-top-level"]]);
    }) as DnsPromisesModule["resolveTxt"];

    const actual = {
      resolveTxt,
      Resolver: FakeResolver,
    } as unknown as DnsPromisesModule;

    return { actual, topLevelCalls, setServersCalls, resolverCalls };
  };

  it("rejects `_atproto.<handle>` TXT lookups on the top-level resolveTxt without calling through", async () => {
    const { actual, topLevelCalls } = buildFakeActual();
    const stub = createDnsStub(actual);

    await expect(
      stub.resolveTxt("_atproto.bobatan.fujocoded.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });
    await expect(
      stub.default.resolveTxt("_atproto.bobatan.fujocoded.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });

    expect(topLevelCalls).toEqual([]);
  });

  it("normalizes DNS hostnames before deciding whether to intercept", async () => {
    const { actual, topLevelCalls } = buildFakeActual();
    const seenHandles: string[] = [];
    const stub = createDnsStub(actual, {
      shouldInterceptHandle: (handle) => {
        seenHandles.push(handle);
        return handle === "bobatan.fujocoded.test";
      },
    });

    await expect(
      stub.resolveTxt("_ATPROTO.Bobatan.FujoCoded.Test."),
    ).rejects.toMatchObject({ code: "ENODATA" });

    expect(seenHandles).toEqual(["bobatan.fujocoded.test"]);
    expect(topLevelCalls).toEqual([]);
  });

  it("delegates non-atproto TXT lookups to the real resolveTxt", async () => {
    const { actual, topLevelCalls } = buildFakeActual();
    const stub = createDnsStub(actual);

    await expect(stub.resolveTxt("fujocoded.test")).resolves.toEqual([
      ["from-top-level"],
    ]);
    expect(topLevelCalls).toEqual(["fujocoded.test"]);
  });

  it("forwards `_atproto.*` queries to real DNS when shouldInterceptHandle returns false", async () => {
    const { actual, topLevelCalls, resolverCalls } = buildFakeActual();
    const stub = createDnsStub(actual, {
      shouldInterceptHandle: (handle) => handle.endsWith(".fujocoded.test"),
    });

    await expect(
      stub.resolveTxt("_atproto.bobatan.fujocoded.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });

    await expect(
      stub.resolveTxt("_atproto.alice.bsky.social"),
    ).resolves.toEqual([["from-top-level"]]);
    expect(topLevelCalls).toEqual(["_atproto.alice.bsky.social"]);

    const resolver = new stub.Resolver();
    await expect(
      resolver.resolveTxt("_atproto.bobatan.fujocoded.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });
    await expect(
      resolver.resolveTxt("_atproto.alice.bsky.social"),
    ).resolves.toEqual([["from-resolver"]]);
    expect(resolverCalls).toEqual(["_atproto.alice.bsky.social"]);
  });

  it("rejects `_atproto.*` from a Resolver instance and delegates everything else", async () => {
    const { actual, setServersCalls, resolverCalls } = buildFakeActual();
    const stub = createDnsStub(actual);
    const resolver = new stub.Resolver();

    resolver.setServers(["1.1.1.1"]);
    expect(setServersCalls).toEqual([["1.1.1.1"]]);

    await expect(
      resolver.resolveTxt("_atproto.bobatan.fujocoded.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });
    expect(resolverCalls).toEqual([]);

    await expect(resolver.resolveTxt("fujocoded.test")).resolves.toEqual([
      ["from-resolver"],
    ]);
    expect(resolverCalls).toEqual(["fujocoded.test"]);
  });

  it("exposes an async Vitest mock factory for setup files", async () => {
    const { actual, topLevelCalls } = buildFakeActual();

    const stub = await createDnsMock(async () => actual);

    await expect(stub.resolveTxt("fujocoded.test")).resolves.toEqual([
      ["from-top-level"],
    ]);
    await expect(
      stub.resolveTxt("_atproto.bobatan.fujocoded.test"),
    ).rejects.toMatchObject({ code: "ENODATA" });
    expect(topLevelCalls).toEqual(["fujocoded.test"]);
  });
});
