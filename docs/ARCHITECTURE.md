# Integration architecture — proposed

This repo currently provides the neighborhood renderer and local idea drafts. The following services must be implemented before launching financial or social features.

## 1. Persistent project identity

Each project has a UUID, idea provenance, name, assets, public page, owner wallet, verified social connections, membership roles and explicit lifecycle:

`draft → reviewed → building → preview_ready → launch_prepared → launched → maintained`

Actual token deployment failure must leave the project in a recoverable state. A mint address and transaction signature are authoritative; animation timing is never evidence that a token launched.

## 2. Server-authoritative simulation

The existing brain service produces decisions through a bounded adapter. A world service resolves the permitted actions, persists state, and emits events. The browser only interpolates movement and renders animations. It must not run one large brain per connected viewer or determine financial actions.

Event envelope:

```json
{
  "eventId": "uuid",
  "projectId": "uuid",
  "sequence": 12,
  "occurredAt": "ISO-8601",
  "type": "build.preview_ready",
  "payload": { "previewUrl": "https://approved-preview-host/..." }
}
```

Persist a snapshot and ordered event stream. Reconnect clients resume from sequence; duplicate event IDs are ignored. Rendering assets and derived outputs should be immutable/versioned.

## 3. Isolated project jobs

Use a background job queue for site generation, image generation, metadata, X drafts and maintenance. Each project gets a sandbox with resource limits and no default access to other projects' files or credentials. Generated sites should use vetted templates and structured content first. Arbitrary generated code requires isolated execution and review before publishing.

Use idempotency keys per project/action/version for job creation, deployment and publication. An upstream timeout must be checked against provider state before retrying, especially token creation.

## 4. X connection

User registers their project account and connects it through official OAuth. Store encrypted access/refresh tokens in the server's secret store, with project-specific access. Record explicit publication consent separately from OAuth login, and provide revocation. No account-creation bot, shared browser cookie export, password store, or default unsolicited replies.

## 5. Sites

Start with hosted project pages under one domain. Published previews are accessible through allowlisted URLs. Later add tenant-specific subdomains and custom domains, with explicit ownership verification. The in-world building links to the verified page and shows deployment state.

## 6. Token and fee routing

Use official Pump SDK/instructions. Resolve the actual mint/program state and recipient wallets. Show simulated network/rent costs, launch metadata, any first-buy amount and exact fee share before wallet signing.

The discussed 80/20 creator/platform split is a proposal, not an implemented or approved economic policy. Pump V2 fee-share updates can revoke further administration. Verify current program/version semantics and inspect final accounts before signing. Do not promise later reallocation through a UI-only CTO.

The signing service is separate from the brain model. Wallet secrets never reach model context, logs, generated code or browsers. For the first release, the owner signs the concrete transaction in their own wallet.

## 7. Team and CTO

Track application governance (page/site management), social control, token authorities and fee rights separately. A wallet-signed application handover only transfers permissions explicitly controlled by this platform. An abandoned-token community can create a distinct community page; it cannot automatically acquire an unavailable X account or immutable fee allocation.

## 8. Mobile performance

Targets, pending measurements: compressed initial transfer under 3 MB, active texture allocation under 32 MB, 30 FPS on supported iPhones, bounded character count and one room/parcel detail view at a time. Use shared atlases, instancing, LOD, lazy model loading and animation culling as the world grows. Keep the existing high-detail room out of the initial neighborhood bundle.

## First end-to-end milestone

One real brief → server-side project record → sandbox-generated static site → verified working preview displayed on the desk → wallet-reviewed launch preparation. Connect the real brain adapter before labeling decisions as brain-driven. Financial and social publishing must remain gated until these integrations are verified.
