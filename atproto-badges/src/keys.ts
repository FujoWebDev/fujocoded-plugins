import { P256Keypair } from "@atproto/crypto";
import { toString, fromString } from "uint8arrays";

export interface GeneratedKeypair {
  /** The private key as a base64url string. Store this in a secret (like an env
   * var) or anyone with it can sign badges as you. */
  privateKeyBase64url: string;
  /** The public key as a `did:key:...` string. Add this to your DID document
   * with `addAttestationVerificationMethod`. This lets people verify you're in
   * possess of the private key. */
  publicDidKey: string;
}

/**
 * Create a new key pair for signing badges.
 *
 * Returns a private key (to be kept secret!) and a public key (to publish to a
 * DID document so others can verify your signatures).
 */
export async function generateSigningKeys(): Promise<GeneratedKeypair> {
  const keypair = await P256Keypair.create({ exportable: true });
  const privateKeyBytes = await keypair.export();
  return {
    privateKeyBase64url: toString(privateKeyBytes, "base64url"),
    publicDidKey: keypair.did(),
  };
}

/**
 * Load a previously saved signing key so you can sign with it again.
 *
 * Pass the `privateKeyBase64url` string you got from
 * `generateSigningKeys`.
 *
 * Returns a key you can pass to `createRecordSignature` or
 * `createBadgeAwardRecord`.
 */
export async function loadSigningKey({
  privateKeyBase64url,
}: {
  privateKeyBase64url: string;
}): Promise<P256Keypair> {
  const bytes = fromString(privateKeyBase64url, "base64url");
  if (bytes.length !== 32) {
    throw new Error(
      `Invalid private key: expected 32 bytes, got ${bytes.length}`,
    );
  }
  return P256Keypair.import(bytes, { exportable: false });
}
