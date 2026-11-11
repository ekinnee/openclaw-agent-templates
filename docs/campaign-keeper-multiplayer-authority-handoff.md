# Campaign Keeper — non-owner multiplayer authority handoff

**Decision:** Keep `/ck` owner-only and fail-closed. Complete the authored solo game independently. A shared OpenClaw session or channel does not by itself authorize game-player actions. This is a scoped upstream SDK/host contract proposal, not an implemented API or proof that two people have played.

## Current resources

- Campaign Keeper draft PR: https://github.com/ekinnee/openclaw-agent-templates/pull/2. Task-owned branch/worktree: `feat/campaign-keeper` at `/mnt/projects/openclaw-agent-templates/.worktrees/campaign-keeper-implementation` (refresh HEAD before work).
- Locally installed-version-matching source: `/home/openclaw/openclaw` at `c53c53e749f`, OpenClaw `2026.11.2`; do **not** substitute the separate `/mnt/projects/openclaw` checkout if it is an older revision.
- Existing proof and design: `docs/campaign-keeper-proof.md`, `docs/campaign-keeper-dashboard.md`, `packages/engine/engine.ts`, `templates/campaign-keeper/tests/acceptance.md`. Read repository guidance before edits.
- The source discussion attached in the original handoff is design provenance, not implementation proof. No Team Gateway credentials or channel IDs are part of this handoff.

## Exact gap

The public plugin-command context has host `senderId`, channel/account/thread/session facts, `isAuthorizedSender`, and `getCurrentConversationBinding()`, but its after-await `assertOwnerCurrent` is supplied to admitted **owners**, not ordinary approved players (`src/plugins/plugin-command.types.ts`, `src/plugins/plugin-command-execution.ts`, `docs/plugins/sdk-overview/tools-and-commands.md`). The current `/ck` handler requires it and denies non-owners before any state access. This is intentional.

The public version-2 model-tool context offers `requesterSenderId`, `sessionId`, delivery facts and `assertInvocationCurrent` (`src/plugins/tool-types.ts`, `src/plugins/tool-factory-context.ts`). That guard establishes current invocation/source authority, **not** the current exact plugin conversation assignment. A pre-CAS binding read can become stale. The V2 keyed store accepts `assertCurrent` through the transaction/commit path (`src/plugin-state/plugin-state-store.types.ts`, `plugin-state-store.ts`), but cannot invent the missing binding-current predicate. The public session-binding inspection is an awaited snapshot, not a lease or effect-time plugin-binding guard. The model-tool route also incurs an LLM call and does not replace cheap deterministic commands.

## Proposed upstream capability — not existing API

An OpenClaw core maintainer should define a public invocation-bound capability on commands and/or model tools that captures the authenticated requester, canonical channel/account/conversation/thread, exact plugin binding ID and generation, and current session incarnation. It should expose an opaque synchronous assertion or native conditional-write predicate composable with the V2 state owner's final effect admission. A conceptual call might be `bindingAuthority.assertCurrent(expectedBindingReceipt)` inside the store authority callback; the actual API and serialization/lease design belong to core. It must fail after detach, rebind, role revocation, session reset, missing/ambiguous identity, and invocation closure. If the binding owner and state owner cannot guarantee the condition at the same irreversible boundary, reject the mutation; do not describe a preliminary read as atomic proof.

Never use model arguments, display names, a supplied game UUID, remembered session-key text, `isAuthorizedSender` alone, or an owner boolean from an earlier turn as a substitute. Host allowlists and campaign membership are distinct gates. On Control UI, use its authenticated Gateway profile/operator principal rather than borrowing a channel sender ID; explicitly decide whether guest UI players are supported. On Discord/Teams, keep account, sender, group and thread identities distinct. Player-facing GM tools stay narrow; no shell/file-write grants for gameplay.

Potential core touchpoints: `src/plugins/plugin-command.types.ts`, `plugin-command-execution.ts`, `conversation-binding*.ts`, `src/auto-reply/reply/commands-plugin.ts`, `src/infra/outbound/session-binding-service.ts`, and the public SDK export. These are inspection leads; confirm the current revision and ownership before code. Campaign Keeper then consumes the capability at its shared state owner and binds each approved human sender to one character, rejecting any actor chosen in model text.

## Required proof before allowing a non-owner

1. Core tests with a paused command/tool: rebind/detach or revoke a player after an awaited read and immediately before commit; old invocation must produce **no effect**, including a narrow commit-boundary race. Reset/reused session keys must not inherit a game.
2. Engine tests with the real V2 worker: owner approves two independently identified players; each can move only their own character, wrong room/cross-campaign/admin actions fail, a unique item race has one winner, and same action ID after a lost reply returns its saved roll/effect once. Fresh authority is checked on conflicts and retries.
3. Actual **two distinct authenticated people** in one explicitly approved test conversation/channel/thread on an isolated Gateway, including non-owner role and channel destination checks. Two tabs or synthetic contexts using one principal do not count. No arbitrary channel enablement or global allowlist/mention-gate relaxation. Verify low-cost commands avoid model calls and model-mediated dialogue separately.
4. Restart only an owned disposable test context; verify membership, characters, inventory, room flags, dice receipts and journal survive. Test revocation and malformed/incompatible save refusal. Preserve exact revisions and sanitized logs.

The OpenClaw core maintainer reviews/authorizes the public SDK and host guard. Erick/the personal repository owner reviews the Campaign Keeper consumer. A Gateway operator and channel owner separately approve any real test deployment and participants. No permission to change `team.openclaw.ai` or install on this production Gateway is implied. Until those approvals and proof exist, leave draft PR #2 explicit about unverified multiplayer and do not publish a playable multiplayer claim.

## Copyable next task

> On a current OpenClaw checkout, design and implement a public invocation-bound exact plugin-conversation binding-current effect guard for approved non-owner participants, composed with V2 state commit authority. Start with core command/tool and binding-owner race tests, not Campaign Keeper permission relaxation. Return API contract, source revision, failing-before/passing-after tests, and the supported consumer pattern. Do not touch shared Gateway config or publish. After review and a released host contract, update Campaign Keeper in its existing draft PR; then run a separate authorized two-person channel test.

## Upstream implementation candidate (not yet accepted)

[OpenClaw draft PR #196914](https://github.com/openclaw/openclaw/pull/196914), related to [issue #196909](https://github.com/openclaw/openclaw/issues/196909), proposes an opt-in `withCurrentConversationBinding` capability on command and V2 tool contexts plus a native V2 transaction restriction. At observed remote head `2bb719ae18807ff758c055b3b299e2a8343042bb`, it is **OPEN/DRAFT**, not merged or released. Its PR body reports focused race tests, but hosted checks at that head are mostly skipped; the consumer and any real two-person deployment remain unproved. It deliberately does not grant game membership or owner privilege, and fails closed for unsupported/custom binding owners and unauthenticated contexts. Inspect the eventual reviewed and released SDK contract, not just this proposal's name, before implementing the Campaign Keeper consumer. The app must still establish each actor's membership and scope and compose them with the exact binding restriction at the irreversible V2 effect. This new reference does not lift the owner-only gate or authorize production Gateway changes.
