---
"@fujocoded/atproto-badges": minor
---

Initial release of `@fujocoded/atproto-badges` — ATProto badge attestation utilities for creating, signing, and verifying badges per the badge.blue specification.

Also ships a `/react` subpath export with drop-in `<BadgeSection>`, `<BadgePill>`, `<BadgeClaim>`, and `<BadgeCertificate>` components, plus a `/styles.css` import. Components take async action handlers (`onClaim`/`onVerify`/`onUnclaim`) and theming props (`issuerName`, `getBadgeShortName`, `isRemoteBadge`, custom icon renderers), so consumers wire them to their own backend without forking. Requires Tailwind v4 in the consuming project.
