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

## Disposable real V2 state check

A standalone temporary-state probe on OpenClaw 2026.11.2 used the actual `createPluginStateKeyedStoreV2` worker API with a two-row `reject-new` namespace. It observed an absent key, applied a CAS set, confirmed a stale comparison returned `conflict`, closed the state database, reopened a new store on the same disposable state directory, and read the committed value `1`. Output: `{"realV2":true,"initial":"applied","stale":"conflict","reopen":1}`; process exited 0 and its temporary directory was removed. This validates the host store primitive in isolation, **not** Campaign Keeper's plugin loading, action authority, a Gateway restart, or a live game replay. No production state was touched.

## Later local mechanics and verification

With Erick's explicit Campaign Keeper coding-route exception, the branch advanced through `fa97231` (Pump solo brace), `8a471c1` (explicit endings and active/completed counts), `d40975b` (warnings plus dial/beacon/consequences committed in the ending row), `f733ca5` (old prototype saves fail closed), and `0d34d96` (lost-reply replay regression). Twenty focused tests passed with the local TS runner. Plugin validation returned `valid: true` and `plugins build --root packages/engine --check` reported metadata current using temporary task-local SDK/esbuild links, which were removed afterward. The package remains a prototype with owner-only commands and no live rendered/install proof.

The Pump brace is an improvised solo route, not a full two-player handoff; numeric combat, complete NPC/encounter consequences, and themed generation remain future scope. A disposable real V2 store reopen does not prove an actual Gateway restart. A separate SDK inspection found a potential **model-mediated** version-2 tool route with `assertInvocationCurrent` for non-owner turns, but it has not been implemented or validated for Campaign Keeper; it cannot be treated as a cheap command equivalent. The public `/ck` command still has the non-owner after-await authority blocker.

## Campaign Keeper command logic against disposable real V2 state

An additional isolated probe invoked `runCommand` against the actual OpenClaw V2 keyed-state worker (not a mocked store) in a temporary directory. With a **synthetic owner context**, it accepted create, moved to Beacon Tower, and committed a `3+3+2=8` Wits roll. After closing the database and reopening a new store, `look` showed Beacon Tower and replay of the move and roll returned their original receipts without rerolling. The store held one game row at version 3. Output: `{"realV2":true,"commandCreate":true,"reopenRoom":"tower","sameRoll":true,"sameMove":true,"rows":1,"version":3}`; process exited 0 and the temporary state directory was removed. This is evidence for engine logic plus host storage persistence across a store reopen, **not** a Gateway restart, installed plugin, authenticated user, or multiplayer adapter test.

## Multiplayer-aware disposable V2 checks (not multiplayer proof)

A separate disposable real V2 worker probe started two game rows using the same host session key and different **synthetic** session IDs, observed the aggregate count of two, and reopened the store with both rows preserved. Two concurrent owner requests to claim the same unique safety line yielded exactly one accepted claim and one unavailable-item result; the winning game row held one copy. A synthetic non-owner command was denied. Output: `{"realV2":true,"distinctIncarnations":2,"winningClaims":1,"guestDenied":true,"reopenRows":2}`; process exited 0 and its temporary state directory was removed. This tests the state owner with synthetic contexts against the actual V2 store. It **does not** prove two authenticated people, a real channel adapter, safe non-owner gameplay, a Gateway restart, or installed plugin behavior.

## Focus-week solo route (engine-only proof)

After review, `c114347` added room-scoped Pell/Suri/Mara conversations and committed clue facts; `ba11abe` required a committed stakes explanation before an ending. The 21 focused fake-store/rules tests passed, including direct-to-Tower refusal until Mara explains the consequences. A disposable real V2 worker probe then walked **17 deterministic owner actions** from game creation through Tavern plate, Market/Pump, Archive plan, opened stair, and the balanced finale. Its first launch failed at an intentionally blocked Archive-to-Tower stair (the probe omitted the required open action); the corrected launch opened the stair explicitly, committed `ending=balanced` and `beacon=lit`, reopened the store, replayed the final receipt, and counted one completed game. Output: `{"realV2":true,"actions":17,"ending":"balanced","beacon":"lit","reopened":true,"completedGames":1}`; process exited 0 and temporary state was removed. This is engine-only scripted proof with a synthetic owner, **not** a GM/model dialogue, installed plugin, Gateway restart, or a human playtest. The earlier failed launch reached no finale assertion and is not counted as success.

## Focus-week authored-world and GM handoff additions

`f381319` tracks the Market weather crate and twine as unique world items and requires actual crate ownership before the Pump solo brace; the focused suite reached 22 passes. `a7ccc39` added owner-scoped `/ck scene`: it reads an authorized committed player projection and returns the public SDK's `continueAgent: { prompt }` shape while deterministic commands remain command-only. `d3e9943` limited that scene handoff to the game creator and added await-boundary tests for demotion and rebinding. Twenty-five focused fake-store/rules tests passed. An independent read-only review found no confirmed high-severity scene code defect, but cautioned that prior chat and private GM source remain available to the model; prompt wording is **not spoiler isolation**. No installed GM model turn or adversarial narration test was observed. The reviewer used a source checkout that appeared older than the target; the primary host independently reports OpenClaw `2026.11.2` at `c53c53e749f`, matching the package peer pin.

## Risk/action review and current solo-store rerun

`8944bb4` added an optional Archive shelf action that commits dice and Resolve/surge effects together, plus Tavern recovery; independent review found zero-Resolve retreat choice, rest-period, capacity, and malformed-save issues. `387bb43` repaired those without claiming generalized combat, and `bf66c55` pinned the 64th-receipt/65th-refusal boundary. Twenty-nine focused fake-store/rules tests passed. The Archive risk still uses a fixed 7–9 Resolve cost rather than the authored alternative to leave a nonessential item, and the command itself does not prove stakes were stated before rolling.

The previous disposable solo script was updated to take the tracked Market crate before the Pump brace. The corrected **18-action** route on actual temporary V2 state reached the balanced ending, reopened its state and returned one completed game: `{"realV2":true,"actions":18,"ending":"balanced","beacon":"lit","reopened":true,"completedGames":1}`; process exited 0 and temporary state was removed. This remains synthetic owner/engine-only proof, not an installed GM/model or human playtest.

## Offline plugin artifact proof (not installation)

`openclaw plugins pack --root packages/engine --out /tmp/ck-engine-offline-proof.tgz --json` first refused because the package-local `esbuild` dev dependency was not resolvable. With temporary task-local links to the host's matching `openclaw` SDK and `esbuild`, the pack command succeeded and produced a **10,804-byte** archive with SHA-256 `d6996dabc6189c64f102032b7650b6fac2bbbfc0c8fb17e8f09af3b64987897b`. Inspecting its contents showed `package/dist/index.js`, immutable browser UI assets, manifest, and a package selector for `./dist/index.js` with OpenClaw peer `2026.11.2`. The temporary links were removed and the worktree remained clean. This is an offline import artifact for the **unreleased, owner-only spike**, not a ClawHub release, activation approval, installed plugin, Agent Template dependency, or live gameplay proof. Do not submit its returned activation request or expose the native UI on a shared Gateway without separate review and authority.

## Required external acceptance still open

- Select and approve one exact test conversation/channel/thread, and demonstrate two distinct authenticated senders through its real command adapter. Do not loosen global allowlists or mention gating.
- Observe real concurrent item-claim ordering, replay receipt (same roll), rejected impersonation and wrong-room/cross-campaign/admin requests at the adapter and state boundary.
- Install the engine only in an owned disposable test context; show deterministic commands bypassing the model and an actual model continuation separately.
- Restart only an owned disposable test context, then verify characters, items, flags, rolls and journal are recovered from persisted state.
- Validate/dev/build the template, inspect capability grants, and run an isolated Add with a real exact engine dependency. The registry path cannot be called complete before an immutable released plugin exists.
- Play through failure and multiple endings; inspect spoiler-safe text and UI, and capture actual browser proof if a board ships.

Record commands, revisions, sanitized output and reviewer findings below as tests are completed; do not substitute fixtures or mock identities for live integration evidence.
