import { describe, it, expect } from "vitest";
import { fromString } from "uint8arrays";
import {
  generateSigningKeys,
  loadSigningKey,
  getRecordHash,
  createRecordSignature,
  createBadgeAwardRecord,
  verifyBadgeAward,
  getBadgeRkey,
} from "../index.ts";
import type { BadgeAward } from "../types.ts";

const TEST_DID = "did:plc:testissuer";
const TEST_RECIPIENT = "did:plc:testrecipient";
const TEST_BADGE_REF = {
  uri: "at://did:plc:testissuer/community.lexicon.badge.definition/abc123",
  cid: "bafyreifake",
};

/** Mock resolver that returns a PLC-format DID doc with the given did:key */
function mockResolver(publicDidKey: string) {
  return async (_did: string) => ({
    verificationMethods: {
      attestations: publicDidKey,
    },
  });
}

describe("generateSigningKeys", () => {
  it("returns valid base64url private key + did:key public key", async () => {
    const keys = await generateSigningKeys();
    expect(keys.privateKeyBase64url).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(keys.publicDidKey).toMatch(/^did:key:z/);
  });
});

describe("loadSigningKey", () => {
  it("round-trips with generated key", async () => {
    const keys = await generateSigningKeys();
    const loaded = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    expect(loaded.did()).toBe(keys.publicDidKey);
  });

  it("throws on invalid input (wrong length)", async () => {
    // 16 bytes encoded as base64url
    const shortKey = "AAAAAAAAAAAAAAAAAAAAAA";
    await expect(
      loadSigningKey({ privateKeyBase64url: shortKey }),
    ).rejects.toThrow("expected 32 bytes");
  });

  it("throws on invalid input (garbage string)", async () => {
    await expect(
      loadSigningKey({ privateKeyBase64url: "!!not-valid!!" }),
    ).rejects.toThrow();
  });
});

describe("getRecordHash", () => {
  it("is deterministic (same input = same CID)", async () => {
    const record = { $type: "test", value: "hello" };
    const metadata = {
      $type: "community.lexicon.attestations.signature" as const,
      key: `${TEST_DID}#attestations`,
    };
    const cid1 = await getRecordHash({
      record,
      metadata,
      repositoryDid: TEST_RECIPIENT,
    });
    const cid2 = await getRecordHash({
      record,
      metadata,
      repositoryDid: TEST_RECIPIENT,
    });
    expect(cid1.toString()).toBe(cid2.toString());
  });

  it("throws a clear error on undefined fields", async () => {
    const record = {
      $type: "test",
      badField: undefined,
    };
    const metadata = {
      $type: "community.lexicon.attestations.signature" as const,
      key: `${TEST_DID}#attestations`,
    };
    await expect(
      getRecordHash({ record, metadata, repositoryDid: TEST_RECIPIENT }),
    ).rejects.toThrow('field "badField" is undefined');
  });

  it("throws on nested undefined fields", async () => {
    const record = {
      $type: "test",
      nested: { good: "value", bad: undefined },
    };
    const metadata = {
      $type: "community.lexicon.attestations.signature" as const,
      key: `${TEST_DID}#attestations`,
    };
    await expect(
      getRecordHash({ record, metadata, repositoryDid: TEST_RECIPIENT }),
    ).rejects.toThrow('field "nested.bad" is undefined');
  });
});

describe("createRecordSignature", () => {
  it("rejects invalid organizerDid", async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    await expect(
      createRecordSignature({
        record: { $type: "test" },
        organizerDid: "not-a-did",
        recipientDid: TEST_RECIPIENT,
        signingKey,
      }),
    ).rejects.toThrow("Invalid organizerDid");
  });
});

describe("verifyBadgeAward", () => {
  it("sign/verify round-trip", async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });
    const result = await verifyBadgeAward({
      award,
      resolveDidDoc: mockResolver(keys.publicDidKey),
    });
    expect(result.verified).toBe(true);
    if (result.verified) {
      expect(result.issuerDid).toBe(TEST_DID);
    }
  });

  it("verified:false when record tampered after signing", async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });
    // Tamper with the record
    const tampered: BadgeAward = { ...award, did: "did:plc:tampered" };
    const result = await verifyBadgeAward({
      award: tampered,
      resolveDidDoc: mockResolver(keys.publicDidKey),
    });
    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.error).toBe("signature_invalid");
    }
  });

  it('error "no_signatures" (empty signatures array)', async () => {
    const award: BadgeAward = {
      $type: "community.lexicon.badge.award",
      did: TEST_RECIPIENT,
      badge: TEST_BADGE_REF,
      issued: new Date().toISOString(),
      signatures: [],
    };
    const result = await verifyBadgeAward({ award });
    expect(result).toEqual({ verified: false, error: "no_signatures" });
  });

  it('error "invalid_key_id" (no sig matching pattern)', async () => {
    const award: BadgeAward = {
      $type: "community.lexicon.badge.award",
      did: TEST_RECIPIENT,
      badge: TEST_BADGE_REF,
      issued: new Date().toISOString(),
      signatures: [
        {
          $type: "community.lexicon.attestations.signature",
          key: "not-a-did-key",
          signature: { $bytes: "AAAA" },
        },
      ],
    };
    const result = await verifyBadgeAward({ award });
    expect(result).toEqual({ verified: false, error: "invalid_key_id" });
  });

  it('error "no_attestation_key" (DID doc missing key)', async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });
    // Resolver returns doc without attestation key
    const result = await verifyBadgeAward({
      award,
      resolveDidDoc: async () => ({ verificationMethods: {} }),
    });
    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.error).toBe("no_attestation_key");
    }
  });

  it('error "plc_fetch_failed" (resolver throws)', async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });
    const result = await verifyBadgeAward({
      award,
      resolveDidDoc: async () => {
        throw new Error("network error");
      },
    });
    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.error).toBe("plc_fetch_failed");
      expect(result.issuerDid).toBe(TEST_DID);
    }
  });

  it('error "signature_invalid" (valid format, wrong key)', async () => {
    const issuerKeys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: issuerKeys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });
    // Verify with a different key
    const wrongKeys = await generateSigningKeys();
    const result = await verifyBadgeAward({
      award,
      resolveDidDoc: mockResolver(wrongKeys.publicDidKey),
    });
    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.error).toBe("signature_invalid");
    }
  });

  it("works with did:web mock resolver", async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const webDid = "did:web:example.com";
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: webDid,
      signingKey,
    });
    // W3C DID doc format (verificationMethod array)
    const result = await verifyBadgeAward({
      award,
      resolveDidDoc: async () => ({
        verificationMethod: [
          {
            id: "#attestations",
            type: "Multikey",
            publicKeyMultibase: keys.publicDidKey.replace("did:key:", ""),
          },
        ],
      }),
    });
    expect(result.verified).toBe(true);
    if (result.verified) {
      expect(result.issuerDid).toBe(webDid);
    }
  });

  it("verifies when signature.$bytes is Uint8Array (PDS CBOR round-trip)", async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });

    // Simulate PDS read-back: the PDS decodes the CBOR bytes tag and
    // returns { $bytes: Uint8Array } instead of { $bytes: "base64str" }.
    const base64Str = (award.signatures[0]!.signature as { $bytes: string })
      .$bytes;
    const decoded: BadgeAward = {
      ...award,
      signatures: [
        {
          ...award.signatures[0]!,
          signature: {
            $bytes: fromString(base64Str, "base64") as unknown as string,
          },
        },
      ],
    };

    const result = await verifyBadgeAward({
      award: decoded,
      resolveDidDoc: mockResolver(keys.publicDidKey),
    });
    expect(result.verified).toBe(true);
  });

  it("verifies when signature is a bare Uint8Array", async () => {
    const keys = await generateSigningKeys();
    const signingKey = await loadSigningKey({
      privateKeyBase64url: keys.privateKeyBase64url,
    });
    const award = await createBadgeAwardRecord({
      recipientDid: TEST_RECIPIENT,
      badgeRef: TEST_BADGE_REF,
      organizerDid: TEST_DID,
      signingKey,
    });

    // Simulate a case where signature itself is a raw Uint8Array
    const base64Str = (award.signatures[0]!.signature as { $bytes: string })
      .$bytes;
    const decoded: BadgeAward = {
      ...award,
      signatures: [
        {
          ...award.signatures[0]!,
          signature: fromString(base64Str, "base64") as any,
        },
      ],
    };

    const result = await verifyBadgeAward({
      award: decoded,
      resolveDidDoc: mockResolver(keys.publicDidKey),
    });
    expect(result.verified).toBe(true);
  });
});

describe("getBadgeRkey", () => {
  it("is deterministic and different URIs produce different rkeys", () => {
    const rkey1 = getBadgeRkey({ badgeDefinitionUri: "at://did:plc:a/col/1" });
    const rkey2 = getBadgeRkey({ badgeDefinitionUri: "at://did:plc:a/col/1" });
    const rkey3 = getBadgeRkey({ badgeDefinitionUri: "at://did:plc:a/col/2" });
    expect(rkey1).toBe(rkey2);
    expect(rkey1).not.toBe(rkey3);
    expect(rkey1).toHaveLength(13);
  });
});
