import {
  encode as dagCborEncode,
  code as DAG_CBOR_CODEC,
} from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import type { P256Keypair } from "@atproto/crypto";
import { verifySignature } from "@atproto/crypto";
import { DidResolver } from "@atproto/identity";
import { toString, fromString } from "uint8arrays";
import type { StrongRef, AttestationSignature, BadgeAward } from "./types.ts";

interface SignatureMetadata {
  $type: "community.lexicon.attestations.signature";
  key: string;
  repository?: string;
  signature?: { $bytes: string };
}

/**
 * Compute the hash (CID) of an ATProto record, that is the value that
 * gets signed.
 *
 * You'd use this to:
 * - Verify an existing signature by recomputing the hash and checking it
 * - Let multiple signers each sign the same hash independently
 *
 * You don't need this for normal badge issuing: `createRecordSignature`
 * and `createBadgeAwardRecord` call it internally.
 */
export async function getRecordHash({
  record,
  metadata,
  repositoryDid,
}: {
  record: Record<string, unknown>;
  metadata: SignatureMetadata;
  repositoryDid: string;
}): Promise<CID> {
  const { signatures: _, ...recordWithoutSigs } = record;
  const { signature: _s, ...metadataClean } = metadata;
  const sigPayload = { ...metadataClean, repository: repositoryDid };
  const attestationPayload = { ...recordWithoutSigs, $sig: sigPayload };

  // Validate: CBOR cannot encode undefined, fail fast with a clear message
  for (const [key, value] of Object.entries(attestationPayload)) {
    if (value === undefined) {
      throw new Error(`Cannot CBOR-encode record: field "${key}" is undefined`);
    }
    if (
      typeof value === "object" &&
      value !== null &&
      !ArrayBuffer.isView(value)
    ) {
      for (const [nested, nv] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (nv === undefined) {
          throw new Error(
            `Cannot CBOR-encode record: field "${key}.${nested}" is undefined`,
          );
        }
      }
    }
  }

  const encoded = dagCborEncode(attestationPayload);
  const hash = await sha256.digest(encoded);
  return CID.createV1(DAG_CBOR_CODEC, hash);
}

/**
 * Sign any ATProto record with your attestation key.
 *
 * This works on any record shape, NOT just badges. Use it when you're
 * building your own record and just need a signature for it.
 *
 * If you want a ready-made badge award, use `createBadgeAwardRecord`
 * instead.
 */
export async function createRecordSignature({
  record,
  organizerDid,
  recipientDid,
  signingKey,
}: {
  record: Record<string, unknown>;
  organizerDid: string;
  recipientDid: string;
  signingKey: P256Keypair;
}): Promise<AttestationSignature> {
  if (!organizerDid.startsWith("did:")) {
    throw new Error(
      `Invalid organizerDid: must be a DID, got "${organizerDid}"`,
    );
  }

  const keyId = `${organizerDid}#attestations`;
  const metadata: SignatureMetadata = {
    $type: "community.lexicon.attestations.signature",
    key: keyId,
  };

  const cid = await getRecordHash({
    record,
    metadata,
    repositoryDid: recipientDid,
  });
  const sig = await signingKey.sign(cid.bytes);

  return {
    $type: "community.lexicon.attestations.signature",
    key: keyId,
    signature: { $bytes: toString(sig, "base64") },
  };
}

/**
 * Build a signed badge award record for a recipient, ready to write to
 * their PDS.
 *
 * Creates a `community.lexicon.badge.award` record with the right
 * `$type`, a timestamp, and your attestation signature attached.
 *
 * Write it to the recipient's PDS with `com.atproto.repo.putRecord`.
 */
export async function createBadgeAwardRecord({
  recipientDid,
  badgeRef,
  organizerDid,
  signingKey,
}: {
  recipientDid: string;
  badgeRef: StrongRef;
  organizerDid: string;
  signingKey: P256Keypair;
}): Promise<BadgeAward> {
  const record: BadgeAward = {
    $type: "community.lexicon.badge.award",
    did: recipientDid,
    badge: badgeRef,
    issued: new Date().toISOString(),
    signatures: [],
  };

  const attestation = await createRecordSignature({
    record: record as unknown as Record<string, unknown>,
    organizerDid,
    recipientDid,
    signingKey,
  });
  record.signatures.push(attestation);

  return record;
}

export type VerifySuccess = { verified: true; issuerDid: string };
export type VerifyFailure = {
  verified: false;
  error: string;
  issuerDid?: string;
};
export type VerifyResult = VerifySuccess | VerifyFailure;

/**
 * Check whether a badge award's signature is legit.
 *
 * Looks up the issuer's DID document, finds their `#attestations` key,
 * recomputes the record hash, and checks the signature against it.
 *
 * Pass `resolveDidDoc` if you want to supply your own DID resolution
 * (handy for tests or `did:web` issuers). Otherwise it uses the PLC
 * directory.
 */
export async function verifyBadgeAward({
  award,
  plcDirectoryUrl,
  resolveDidDoc,
}: {
  award: BadgeAward;
  plcDirectoryUrl?: string;
  resolveDidDoc?: (did: string) => Promise<unknown>;
}): Promise<VerifyResult> {
  if (!award.signatures.length) {
    return { verified: false, error: "no_signatures" };
  }

  const sig = award.signatures.find((s) => /^did:.+#attestations$/.test(s.key));
  if (!sig) {
    return { verified: false, error: "invalid_key_id" };
  }

  const issuerDid = sig.key.replace(/#attestations$/, "");

  // Resolve DID document
  let didDoc: any;
  try {
    if (resolveDidDoc) {
      didDoc = await resolveDidDoc(issuerDid);
    } else {
      const resolver = new DidResolver({ plcUrl: plcDirectoryUrl });
      didDoc = await resolver.resolveNoCheck(issuerDid);
    }
  } catch {
    return { verified: false, error: "plc_fetch_failed", issuerDid };
  }

  // Extract #attestations key to handle both PLC format (flat object)
  // and W3C DID doc format (verificationMethod array)
  const attestationKey = didDoc?.verificationMethod?.find(
    (vm: any) =>
      vm.id === `${issuerDid}#attestations` || vm.id === "#attestations",
  );
  const didKey = attestationKey?.publicKeyMultibase
    ? `did:key:${attestationKey.publicKeyMultibase}`
    : didDoc?.verificationMethods?.attestations;

  if (!didKey) {
    return { verified: false, error: "no_attestation_key", issuerDid };
  }

  // Reconstruct hash
  const metadata: SignatureMetadata = {
    $type: "community.lexicon.attestations.signature",
    key: sig.key,
  };
  const cid = await getRecordHash({
    record: award as unknown as Record<string, unknown>,
    metadata,
    repositoryDid: award.did,
  });

  // Normalize signature bytes: after a CBOR round-trip (read back from PDS),
  // the signature may be a raw Uint8Array instead of { $bytes: "base64..." }.
  let sigBytes: Uint8Array;
  if (sig.signature instanceof Uint8Array) {
    sigBytes = sig.signature;
  } else if (sig.signature.$bytes instanceof Uint8Array) {
    sigBytes = sig.signature.$bytes;
  } else {
    sigBytes = fromString(sig.signature.$bytes, "base64");
  }

  try {
    const valid = await verifySignature(didKey, cid.bytes, sigBytes);
    return valid
      ? { verified: true, issuerDid }
      : { verified: false, error: "signature_invalid", issuerDid };
  } catch {
    return { verified: false, error: "signature_invalid", issuerDid };
  }
}
