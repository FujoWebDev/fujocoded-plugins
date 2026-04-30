export {
  getRecordHash,
  createRecordSignature,
  createBadgeAwardRecord,
  verifyBadgeAward,
} from "./signing.ts";
export type { VerifyResult, VerifySuccess, VerifyFailure } from "./signing.ts";

export { generateSigningKeys, loadSigningKey } from "./keys.ts";

// Badge operations
export {
  getBadgeRkey,
  getExistingBadgeAward,
  findExistingBadgeDefinition,
  createBadgeDefinition,
  BADGE_COLLECTION,
  BADGE_DEFINITION_COLLECTION,
} from "./badge.ts";

export { addAttestationVerificationMethod } from "./plc.ts";

export type {
  StrongRef,
  AttestationSignature,
  BadgeAward,
  ClickingButtonAward,
  BadgeVerifyResult,
} from "./types.ts";
export type { GeneratedKeypair } from "./keys.ts";
