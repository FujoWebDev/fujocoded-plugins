import { describe, expect, it } from "vitest";

import {
  createMockAtprotoRepo,
  createMockRepoIdentity,
  useMockAtprotoRepo,
  useMockRepoIdentity,
} from "../src/index.ts";
import { DID, HANDLE, PDS } from "./support.ts";
import { server } from "./msw/server.ts";

describe("createMockRepoIdentity", () => {
  it("serves both the PLC doc and well-known DID response", async () => {
    const identity = useMockRepoIdentity(server, {
      did: DID,
      pds: PDS,
      handle: HANDLE,
    });

    const plcResponse = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );
    const didResponse = await fetch(
      `https://${HANDLE}/.well-known/atproto-did`,
    );

    expect(plcResponse.ok).toBe(true);
    await expect(plcResponse.json()).resolves.toMatchObject({
      id: DID,
      alsoKnownAs: [`at://${HANDLE}`],
      service: [
        expect.objectContaining({
          serviceEndpoint: PDS,
        }),
      ],
    });
    await expect(didResponse.text()).resolves.toBe(DID);
    expect(identity).toMatchObject({ did: DID, pds: PDS, handle: HANDLE });
  });

  it("synthesizes a default handle and skips well-known when handle is omitted", async () => {
    const identity = createMockRepoIdentity({ did: DID, pds: PDS });
    server.use(...identity.handlers());
    const expectedHandle = `${DID.split(":").pop()}.example.test`;

    const plcResponse = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );
    await expect(plcResponse.json()).resolves.toMatchObject({
      alsoKnownAs: [`at://${expectedHandle}`],
    });

    await expect(
      fetch(`https://${expectedHandle}/.well-known/atproto-did`).catch(
        (error) => error,
      ),
    ).resolves.toBeInstanceOf(Error);
  });

  it("exposes identity override handlers that compose through server.use", async () => {
    const identity = createMockRepoIdentity({
      did: DID,
      pds: PDS,
      handle: HANDLE,
    });
    server.use(...identity.handlers());
    server.use(identity.wellKnownNotFound());

    const missingHandle = await fetch(
      `https://${HANDLE}/.well-known/atproto-did`,
    );

    expect(missingHandle.status).toBe(404);

    server.use(identity.handleResolvesTo("did:plc:other"));
    const changedHandle = await fetch(
      `https://${HANDLE}/.well-known/atproto-did`,
    );

    await expect(changedHandle.text()).resolves.toBe("did:plc:other");
  });
});

describe("repo identity controls", () => {
  it("includes identity handlers in repo.handlers()", async () => {
    useMockAtprotoRepo(server, { did: DID, handle: HANDLE, pds: PDS });

    const didResponse = await fetch(
      `https://${HANDLE}/.well-known/atproto-did`,
    );

    await expect(didResponse.text()).resolves.toBe(DID);
  });

  it("exposes identity override handlers that compose through server.use", async () => {
    const repo = createMockAtprotoRepo({ did: DID, handle: HANDLE, pds: PDS });
    server.use(...repo.handlers());
    server.use(repo.identity.plcNotFound());

    const response = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );

    expect(response.status).toBe(404);

    server.use(
      repo.identity.didDocument({
        id: DID,
        alsoKnownAs: ["at://custom.example.test"],
      }),
    );
    const custom = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );

    await expect(custom.json()).resolves.toEqual({
      id: DID,
      alsoKnownAs: ["at://custom.example.test"],
    });
  });

  it("keeps mutable identity baseline across handler resets while temporary overrides reset away", async () => {
    const repo = createMockAtprotoRepo({ did: DID, handle: HANDLE, pds: PDS });
    const baselineDocument = {
      id: DID,
      alsoKnownAs: [`at://${HANDLE}`],
      service: [
        {
          id: "#atproto_pds",
          type: "AtprotoPersonalDataServer",
          serviceEndpoint: PDS,
        },
      ],
      verificationMethod: [
        {
          id: `${DID}#atproto`,
          type: "Multikey",
          controller: DID,
          publicKeyMultibase: "zBaselineKey",
        },
      ],
    };
    server.resetHandlers(...repo.handlers());

    repo.identity.setDidDocument(baselineDocument);
    server.use(repo.identity.plcNotFound());

    const override = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );
    expect(override.status).toBe(404);

    server.resetHandlers();
    const baseline = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );

    await expect(baseline.json()).resolves.toEqual(baselineDocument);
  });

  it("updates the current baseline DID document and verification methods", async () => {
    const repo = createMockAtprotoRepo({ did: DID, handle: HANDLE, pds: PDS });
    server.use(...repo.handlers());

    repo.identity.setDidDocument({
      id: DID,
      alsoKnownAs: [`at://${HANDLE}`],
      verificationMethod: [
        {
          id: `${DID}#atproto`,
          type: "Multikey",
          controller: DID,
          publicKeyMultibase: "zOldAtprotoKey",
        },
      ],
    });
    repo.identity.updateDidDocument((document) => ({
      ...document,
      alsoKnownAs: [...(document.alsoKnownAs ?? []), "at://updated.test"],
    }));
    repo.identity.setVerificationMethod("atproto", "zUpdatedAtprotoKey");
    repo.identity.setVerificationMethod("rotation", "did:key:zRotationKey");

    const response = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );
    const document = (await response.json()) as {
      alsoKnownAs?: string[];
      verificationMethod?: Array<Record<string, unknown>>;
    };

    expect(document.alsoKnownAs).toEqual([
      `at://${HANDLE}`,
      "at://updated.test",
    ]);
    expect(document.verificationMethod).toEqual([
      expect.objectContaining({
        id: `${DID}#atproto`,
        publicKeyMultibase: "zUpdatedAtprotoKey",
      }),
      expect.objectContaining({
        id: `${DID}#rotation`,
        type: "Multikey",
        controller: DID,
        publicKeyMultibase: "zRotationKey",
      }),
    ]);
  });

  it("updates the well-known handle baseline and resets identity state", async () => {
    const repo = createMockAtprotoRepo({ did: DID, handle: HANDLE, pds: PDS });
    server.use(...repo.handlers());

    repo.identity.setDidDocument({
      id: DID,
      alsoKnownAs: ["at://changed.example.test"],
    });
    repo.identity.setHandleDid("did:plc:other");

    const changedDocument = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );
    const changedHandle = await fetch(
      `https://${HANDLE}/.well-known/atproto-did`,
    );

    await expect(changedDocument.json()).resolves.toEqual({
      id: DID,
      alsoKnownAs: ["at://changed.example.test"],
    });
    await expect(changedHandle.text()).resolves.toBe("did:plc:other");

    repo.identity.reset();
    const resetDocument = await fetch(
      `https://plc.directory/${encodeURIComponent(DID)}`,
    );
    const resetHandle = await fetch(
      `https://${HANDLE}/.well-known/atproto-did`,
    );
    const resetBody = (await resetDocument.json()) as Record<string, unknown>;

    expect(resetBody).toMatchObject({
      id: DID,
      alsoKnownAs: [`at://${HANDLE}`],
      service: [
        expect.objectContaining({
          serviceEndpoint: PDS,
        }),
      ],
    });
    expect(resetBody).not.toMatchObject({
      alsoKnownAs: ["at://changed.example.test"],
    });
    await expect(resetHandle.text()).resolves.toBe(DID);
  });
});
