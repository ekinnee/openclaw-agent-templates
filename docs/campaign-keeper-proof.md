# Campaign Keeper proof ledger

Campaign Keeper is under development. This file distinguishes source-contract inspection from runtime proof. No entry below claims that a group game, a test restart, a Template Add, or a package publication has happened.

## Scope and version

- Target repository: `ekinnee/openclaw-agent-templates`; feature worktree based on `origin/main` at `bbbf60b4478e589ce190873c2a341b355c6d2854`.
- Locally observed Gateway version: OpenClaw `2026.11.2` (`c53c53e`), November 10, 2026. Matching local source: `/home/openclaw/openclaw`, `c53c53e749f`.
- Existing Language Conversation Partner template is separate; its tests and Add proof do not establish Campaign Keeper behavior.
- The supplied design handoff is a specification, not implementation evidence. The original discussion URL in it is not implementation provenance.

## Contract inspection (not execution proof)

- `src/plugins/plugin-command.types.ts`: command context declares host-resolved `agentId`, `senderId`, `channel`, `channelId`, `accountId`, `from`, `to`, `messageThreadId`, `threadParentId`, `args`, and owner revalidation callback. Optional fields must fail closed where required; an argument or display name is not identity.
- `docs/plugins/sdk-overview/tools-and-commands.md`: registered commands bypass the model and can return `continueAgent: { prompt }`; native command continuation and authorization recheck are documented. This does not prove a particular channel carries two distinct authenticated player identities.
- `src/plugin-state/plugin-state-store.types.ts` and `docs/plugins/sdk-runtime/state-and-system.md`: async keyed stores offer `observe` and `compareAndApply` (optional in public types), with `overflowPolicy: reject-new` available. Capacity, failed/corrupt reads and conflicts require explicit handling. Source inspection does not prove restart recovery.
- `docs/cli/templates.md`: `package.json.openclaw.template` selects `CLAW.md`, `profiles/openclaw.yml` is conventional, and a ClawHub plugin requirement is exact-versioned. A local plugin development package is not an immutable published dependency; portable Add remains incomplete until that release exists.

## Local artifacts and focused tests

- `templates/campaign-keeper/` is an original, complete adventure/content Template staged without a plugin dependency. On this host, `templates validate`, offline `dev`, and `build` succeeded after replacing legacy `cronJobs` with `automations`; reviewed archive `/tmp/campaign-keeper-0.1.0-reviewed.tgz` has SHA-256 `3a88f1c77ad0bef8e3cfc9dbd27f56042da22e702979a8def2b2f6b7b884acd0`. `dev` reports a read-only tool-profile escalation requiring distinct consent, and readiness for its *declared* empty dependencies—not game readiness.
- `packages/engine/` contains a two-room `/ck` capability spike, not the six-room game. After independent review, commit `5a0b8ce` added owner-only admission, a host conversation-binding requirement and bounded `reject-new` storage. Seven fake-store tests pass using Node's test runner and `tsx` from the local OpenClaw source. No plugin installation/loading, real V2 transaction, restart, live two-sender test, dice, unique-item race, or model continuation was exercised.
- The spike deliberately denies ordinary non-owner player commands: this SDK exposes an after-await `assertOwnerCurrent` callback for admitted owners, not an equivalent current-authority assertion for ordinary players. Therefore the required multiplayer interaction cannot be shown on this host using this adapter as written. The SDK also does not supply a transactional binding-current guard on the state write. Those are unresolved release blockers; the current owner-only spike is not a multiplayer implementation. The earlier UUID admission and unbounded-row issues were addressed for the spike, not proven in live integration. Do not install the spike for real players or treat it as the engine dependency.

## Independent isolated-session verification

A separate Campaign Keeper test session on the same `b1b5344` worktree re-ran Template validation and offline `dev --json` successfully. Two disposable Template builds matched SHA-256 `3a88f1c77ad0bef8e3cfc9dbd27f56042da22e702979a8def2b2f6b7b884acd0`; the expected ten package files were present and `tests/acceptance.md` was excluded. The seven engine tests passed again, but use a mocked store. The session made no code changes, install, restart, push or PR. This independent run is *not* a second authenticated player or platform integration test.

Source inspection found `plugin-command-execution.ts` exposes `assertOwnerCurrent` only for admitted owners; `getCurrentConversationBinding` is an asynchronous read, not a transactional current-binding effect guard. V2 state action authority can accept `assertCurrent`, but the command context does not supply an equivalent callback for an ordinary non-owner. These remain blockers to claiming safe player mutations on the current command path. A disposable real-worker/reopen test, while useful, would not itself close the two-identity and authorization gaps.

## Opt-in dashboard prototype (not live)

At `e3caccf`, the engine spike gained a native Control UI widget and an opt-in `operator.read` backend action (`dashboardEnabled: true`, exact configured agent ID). The committed game key now includes the host `sessionId`, so a new conversation incarnation can become a distinct game after an accepted create; empty sessions and replayed create requests do not increase totals. The widget renders aggregate counts only, not raw identities, game IDs, locations, bindings or GM notes. Its own tests exercise absent read access and stale responses after a session switch.

On this worktree, 12 focused tests passed using temporary local SDK/esbuild links, then the links were removed. `plugins build --root packages/engine --check` reported metadata up to date. These are fixture/browser-DOM tests and package checks, **not** a rendered Control UI installation or live data proof. The opt-in widget remains uninstalled; the engine is still only a two-room owner-only spike. The read model scans bounded committed rows but is not a transactionally consistent cross-row snapshot. No second human identity, disposable restart, or full game was tested.

## Authored-world and rules progress (local only)

After the earlier proof snapshots, `227ce9d` added a six-room map, legal exits, limited room-scoped text, unique item claims, inventory and a public journal. Independent read-only review found hidden-item bypass, mutable-save validation and Pump shortcut gaps. `8ccdff4` fixed the hidden safety-line discovery and added fail-closed save validation, while explicitly labeling `open pump-hatch` a prototype shortcut rather than a completed cooperative obstacle. `27ae93d` added original 2d6/Resolve rule primitives; `fdb7c10` added default attributes and replayable engine-generated roll receipts, without applying hit/damage or story consequences. Seventeen focused engine/rules tests passed on the local fake-store harness. This is **not** the complete six-room adventure or live multiplayer engine; earlier dated proof above describes the state at those commits, not the present code.

## Required external acceptance still open

- Select and approve one exact test conversation/channel/thread, and demonstrate two distinct authenticated senders through its real command adapter. Do not loosen global allowlists or mention gating.
- Observe real concurrent item-claim ordering, replay receipt (same roll), rejected impersonation and wrong-room/cross-campaign/admin requests at the adapter and state boundary.
- Install the engine only in an owned disposable test context; show deterministic commands bypassing the model and an actual model continuation separately.
- Restart only an owned disposable test context, then verify characters, items, flags, rolls and journal are recovered from persisted state.
- Validate/dev/build the template, inspect capability grants, and run an isolated Add with a real exact engine dependency. The registry path cannot be called complete before an immutable released plugin exists.
- Play through failure and multiple endings; inspect spoiler-safe text and UI, and capture actual browser proof if a board ships.

Record commands, revisions, sanitized output and reviewer findings below as tests are completed; do not substitute fixtures or mock identities for live integration evidence.
