import type { AtpAgent } from "@atproto/api";

/**
 * Publish your public signing key to your DID document, so others can
 * verify the badges you sign.
 *
 * This adds an `#attestations` verification method to your PLC
 * document.
 *
 * Requires an email verification token: call
 * `agent.com.atproto.identity.requestPlcOperationSignature()` first
 * to trigger the email, then pass the token you receive as `token`.
 *
 * `publicDidKey` is the `did:key:...` string from
 * `generateSigningKeys`.
 */
export async function addAttestationVerificationMethod({
  agent,
  did,
  publicDidKey,
  token,
  plcDirectoryUrl,
}: {
  agent: AtpAgent;
  did: string;
  publicDidKey: string;
  token: string;
  plcDirectoryUrl?: string;
}): Promise<void> {
  const plcUrl = plcDirectoryUrl ?? "https://plc.directory";
  // Fetch current PLC state to carry forward existing values
  const logRes = await fetch(`${plcUrl}/${did}/log/audit`);
  if (!logRes.ok) {
    throw new Error(`Failed to fetch PLC log: ${logRes.status}`);
  }
  const operations = (await logRes.json()) as Array<{
    operation: {
      verificationMethods?: Record<string, string>;
      rotationKeys?: string[];
      alsoKnownAs?: string[];
      services?: Record<string, unknown>;
    };
  }>;
  const lastOp = operations[operations.length - 1]?.operation;
  if (!lastOp) {
    throw new Error("No PLC operations found");
  }

  // Add attestation key to existing verification methods
  const currentMethods = lastOp.verificationMethods ?? {};
  const newMethods = { ...currentMethods, attestations: publicDidKey.trim() };

  // Ask the PDS to sign a PLC operation with the updated methods
  const { data: signedOp } = await agent.com.atproto.identity.signPlcOperation({
    token: token.trim(),
    verificationMethods: newMethods,
    rotationKeys: lastOp.rotationKeys,
    alsoKnownAs: lastOp.alsoKnownAs,
    services: lastOp.services,
  });

  // Submit the signed operation to the PLC directory
  const submitRes = await fetch(`${plcUrl}/${did}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedOp.operation),
  });
  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`PLC submission failed (${submitRes.status}): ${body}`);
  }
}
