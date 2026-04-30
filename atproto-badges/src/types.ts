export interface StrongRef {
  uri: string;
  cid: string;
}

/**
 * Signature as written to a PDS (JSON: `{ $bytes: "base64..." }`).
 * After a CBOR round-trip (read back from PDS via getRecord/listRecords),
 * the `signature` field may be a raw `Uint8Array` instead.
 */
export interface AttestationSignature {
  $type: "community.lexicon.attestations.signature";
  key: string;
  signature: { $bytes: string | Uint8Array } | Uint8Array;
}

export interface BadgeAward {
  $type: "community.lexicon.badge.award";
  did: string;
  badge: StrongRef;
  issued: string;
  signatures: AttestationSignature[];
}

/**
 * Hydrated view-model of a badge award, suitable for rendering in a UI.
 * Distinct from `BadgeAward`, which is the on-network record shape.
 */
export interface ClickingButtonAward {
  uri: string;
  badgeDefinitionUri: string | undefined;
  issuedAt: string | undefined;
  pdsUrl: string | undefined;
  badgeName: string | undefined;
  badgeDescription: string | undefined;
}

export type BadgeVerifyResult =
  | {
      verified: true;
      issuerDid?: string;
      issuerHandle?: string;
      issuerDisplayName?: string;
    }
  | {
      verified: false;
      error: string;
    };
