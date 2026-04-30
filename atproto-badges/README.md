# `@fujocoded/atproto-badges`

Signed badges on ATproto. Officially Certify™ whatever your heart desires:
events, communities, inside-jokes, friends, and anything in-between!

<!-- badges -->

<div align="center">

<a href="https://choosealicense.com/licenses/mit/"> <img alt="NPM license"
    src="https://img.shields.io/npm/l/%40fujocoded%2Fastro-atproto-loader"
  /> </a> <a href="https://fujocoded.com/"> <img
  src="https://img.shields.io/badge/fujo-coded-555555?labelColor=9c89fa"
    alt="FujoCoded badge"/> </a> <a
  href="https://npmjs.com/package/@fujocoded/atproto-badges"> <img
  src="https://badge.fury.io/js/%40fujocoded%2Fatproto-badges.svg"
    alt="NPM version badge"/> </a> <a
  href="https://codespaces.new/FujoWebDev/fujocoded-plugins"> <img
  src="https://github.com/codespaces/badge.svg" alt="Open in GitHub Codespaces"
    style="height: 20px"/> </a>

</div>

## What is `@fujocoded/atproto-badges`?

`@fujocoded/atproto-badges` lets you create and sign badges on ATProto. You
define a badge (like "Yuletide 2026 Writer" or "ATmosphereConf 2026 attendee"),
sign it with your secret key, and write it to the recipient's PDS, where anyone can
verify it came from you.

Under the hood, it handles the cryptographic attestation (DAG-CBOR hashing,
P-256 signing, PLC document updates) so you can focus on when and why to award
badges, not how the signatures work.

## What's included in `@fujocoded/atproto-badges`?

In this package, you'll find utilities to manage:

- **Key management**
  - `generateSigningKeys` creates a new key pair for signing badges
  - `loadSigningKey` loads a previously saved key so you can sign with it again
- **Badge definitions**
  - `createBadgeDefinition` creates a new badge type on your PDS
  - `findExistingBadgeDefinition` checks if a badge type already exists, so you
    don't create duplicates
- **Badge awards**
  - `createBadgeAwardRecord` builds a signed badge award, ready to write to a
    recipient's PDS
  - `getExistingBadgeAward` checks if someone already has a particular badge
  - `getBadgeRkey` gives you a deterministic record key, so concurrent requests
    don't create duplicate awards
- **PLC updates**
  - `addAttestationVerificationMethod` publishes your public key to your DID
    document, so others can verify your signatures
- **Verification**
  - `verifyBadgeAward` checks whether a badge award's signature is legit — looks
    up the issuer's DID document and verifies the cryptographic signature
- **Lower-level signing** (if you're building something custom)
  - `createRecordSignature` signs any ATProto record, not just badges
  - `getRecordHash` computes the hash that gets signed — useful for verification
    or multi-signer workflows

## What can you do with `@fujocoded/atproto-badges`?

- **Award participation badges for events & exchanges:** give artists, writers,
  and other participants a verifiable badge that lives in their ATProto account—
  whether you're hosting Yuletide or a smaller shipping week
- **Recognize contributors:** zine participants, community moderators, event
  volunteers, code contributors...whatever you want to celebrate, put a badge on
  it!
- **Verify badges:** — use `verifyBadgeAward` to confirm a badge is legit by
  checking the issuer's signature against their published key
- **Build tools to mint and manage badges:** these bad ~~boy~~badges can fit so
  many use cases within them!

## Installation

```bash
npm add @fujocoded/atproto-badges
```

## Getting started

Here's the typical flow, from setup to awarding your first badge.

At high level:

1. Generate your secret key to sign badges with <u>and store them safely!</u>
2. Publish your public key on your Identity Document™
3. Create a badge definition in your PDS...
4. ...then award it someone, with a signed copy in their PDS!

### 1. Generate your signing key

This generates your super ultra mega secret credentials that allow you to sign
badges, pinkie-promising it is indeed you. <u>You only need to do this once!</u>

```ts
import fs from "node:fs";
import { generateSigningKeys } from "@fujocoded/atproto-badges";

const keys = await generateSigningKeys();

// If you want, you can save them to files

// This will be BADGE_PRIVATE_KEY in your secrets
fs.writeFileSync("./private.key", keys.privateKeyBase64url);
// This is your public key, for step 2
fs.writeFileSync("./public.key.txt", keys.publicDidKey);
```

> [!IMPORTANT]
>
> You must keep the private key somewhere safe and never show it to anyone. If
> you lose it, you won't be able to sign with that key anymore; if someone steals
> it, they'll be able to sign as you.
>
> When using private keys in your programs, make sure to use environment variables
> rather than hardcoding them. <u>Never commit them to Git.</u>

### 2. Publish your public key

To let everyone know you're the one whose secret key has been going around
signing badges left and right, you must first upload the corresponding public
key to your DID document—that is, to your ATproto "id card".

This command will send a verification email, and update your PLC
document with the content of the key:

```ts
import { addAttestationVerificationMethod } from "@fujocoded/atproto-badges";

// Your DID, in this case the "yuletide exchange"
const exchangeDid = "did:plc:yuletide";

// First, trigger the verification email:
await agent.com.atproto.identity.requestPlcOperationSignature();

// Then, once you have the token from the email:
await addAttestationVerificationMethod({
  // Check out @fujocoded/authproto if you have an
  // Astro site!
  agent,
  // Your identity
  did: exchangeDid,
  // Your public key
  publicDidKey: keys.publicDidKey,
  token,
});
```

### 3. Create a badge definition

A badge definition describes what the badge is. You create it once, put it on
your PDS, then reference it every time you award it:

```ts
import {
  createBadgeDefinition,
  findExistingBadgeDefinition,
} from "@fujocoded/atproto-badges";

// Check if it already exists first!
const existing = await findExistingBadgeDefinition({
  agent,
  did: exchangeDid,
  name: "Yuletide 2026 Writer",
});

if (existing) {
  return "don't be greedy!";
}

const badgeDefinition = await createBadgeDefinition({
  agent,
  // Badge owner
  did: exchangeDid,
  // Badge name
  name: "Yuletide 2026 Writer",
  // Badge description
  description: "Completed a gift fic for Yuletide 2026",
});
```

> [!NOTE]
>
> The `agent` used for `putRecord` must be authenticated as the **issuer** of the badge. This establishes the legitimacy of the badge.

### 4. Award the badge

```ts
import {
  createBadgeAwardRecord,
  getExistingBadgeAward,
  getBadgeRkey,
  loadSigningKey,
} from "@fujocoded/atproto-badges";

const participantDid = "did:plc:participant";

// Don't award it twice!
const currentAward = await getExistingBadgeAward({
  agent,
  did: participantDid,
  badgeDefinitionUri: badgeRef.uri,
});

if (currentAward) {
  return "don't be greedy!";
}

// Get your key ready to sign!
const signingKey = await loadSigningKey({
  privateKeyBase64url: process.env.BADGE_PRIVATE_KEY!,
});

// "I hereby award you the badge—"
const award = await createBadgeAwardRecord({
  // The badge recipient
  recipientDid: participantDid,
  // Reference returned by createBadgeDefinition
  badgeRef: badgeDefinition,
  // Your DID
  organizerDid: exchangeDid,
  signingKey,
});

// Save the badge to the recipients PDS
await agent.com.atproto.repo.putRecord({
  repo: participantDid,
  collection: "community.lexicon.badge.award",
  rkey: getBadgeRkey({ badgeDefinitionUri: badgeRef.uri }),
  record: award,
});
```

> [!Note]
>
> The `agent` used for `putRecord` must be authenticated as the **recipient of
> the badge**, not the issuer.
>
> The recipient claims their badge by writing the issuer-signed badge to their
> own PDS. The issuer never needs write access to the recipient's repo—the
> signature itself proves legitimacy.

## Good to know

- Badge **definitions** live in the issuing organization's repo. Badge
  **awards** go in the recipient's repo.
- `getExistingBadgeAward` looks up a badge award by definition URI and returns
  the full record value. You can check the CID yourself if you need to
  distinguish between versions of a badge definition.
- `getBadgeRkey` derives the record key from the badge definition URI. This
  means awarding the same badge definition to the same person always targets the
  same record (easier to avoid duplicates!).
- This package handles signing and data — you bring your own `AtpAgent`,
  authentication, and app logic around it.

> [!WARNING]
>
> All parameters to `createBadgeAwardRecord` must be defined — passing
> `undefined` for any field (e.g. an unset env var for `organizerDid`) will
> throw with a message like `Cannot CBOR-encode record: field "organizerDid" is
undefined`. ATProto records are CBOR-encoded, and CBOR has no concept of
> `undefined`.

## Based on

The attestation signing in this package is based on the
[`atproto-attestation`](https://tangled.org/@smokesignal.events/atproto-identity-rs)
Rust crate by [smokesignal.events](https://tangled.org/@smokesignal.events/). If you're looking for a full Rust
implementation (including CLI tools for signing and verifying attestations),
check that out!

# Support Us

You can check out more of our plugins here:

- [Authproto](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/astro-authproto)
- [Socials plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/zod-transform-socials)
- [Alt text files plugin](https://github.com/FujoWebDev/fujocoded-plugins/tree/main/remark-alt-text-files)

You can also become a patron or buy some merch:

- [Monthly Support](https://fujocoded.com/support)
- [Merch Shop](https://store.fujocoded.com/)
- [RobinBoob](https://www.robinboob.com/)

# Follow Us

<p align="center"><a href="https://twitter.com/fujoc0ded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/twitter.svg" /></a><a href="https://www.tumblr.com/fujocoded"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/tumblr.svg" /></a><a href="https://bsky.app/profile/fujocoded.bsky.social"><img width="35" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/bluesky.svg" /></a><a href="https://blorbo.social/@fujocoded"><img width="35"  src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/mastodon.svg" /></a><a href="https://fujocoded.dreamwidth.org/"><img width="17" src="https://raw.githubusercontent.com/FujoWebDev/.github/main/profile/images/dreamwidth.svg" /></a></p>
