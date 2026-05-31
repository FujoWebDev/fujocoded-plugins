import { describe, expect, it, vi } from "vitest";

import { useMockPlcOperationFlow } from "../src/index.ts";
import { DID, fetchJson, HANDLE, PDS } from "./support.ts";
import { server } from "./msw/server.ts";

describe("createMockPlcOperationFlow", () => {
  it("serves PLC audit state, signs via the PDS, and captures PLC submission", async () => {
    const onSign = vi.fn();
    const onSubmit = vi.fn();
    const operation = {
      verificationMethods: { atproto: "did:key:zAtproto" },
      rotationKeys: ["did:key:zRotation"],
      alsoKnownAs: [`at://${HANDLE}`],
      services: { atproto_pds: { type: "AtprotoPersonalDataServer" } },
    };
    const signedOperation = { type: "plc_operation", sig: "signed" };
    const flow = useMockPlcOperationFlow(server, {
      did: DID,
      pds: PDS,
      operation,
      signedOperation,
      onSign,
      onSubmit,
    });

    const audit = await fetchJson(`https://plc.directory/${DID}/log/audit`);
    const signed = await fetchJson(
      `${PDS}/xrpc/com.atproto.identity.signPlcOperation`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: "123456",
          verificationMethods: {
            atproto: "did:key:zAtproto",
            attestations: "did:key:zAttestation",
          },
          rotationKeys: operation.rotationKeys,
          alsoKnownAs: operation.alsoKnownAs,
          services: operation.services,
        }),
      },
    );
    const submitted = await fetch(`https://plc.directory/${DID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signedOperation),
    });

    expect(audit.body).toEqual([{ operation }]);
    expect(flow).toMatchObject({
      did: DID,
      pds: PDS,
      plcDirectoryUrl: "https://plc.directory",
    });
    expect(signed.body).toEqual({ operation: signedOperation });
    expect(submitted.ok).toBe(true);
    expect(onSign).toHaveBeenCalledWith({
      token: "123456",
      verificationMethods: {
        atproto: "did:key:zAtproto",
        attestations: "did:key:zAttestation",
      },
      rotationKeys: operation.rotationKeys,
      alsoKnownAs: operation.alsoKnownAs,
      services: operation.services,
    });
    expect(onSubmit).toHaveBeenCalledWith(signedOperation);
  });
});
