# Campaign Keeper engine capability spike

Unpublished Campaign Keeper engine prototype. The solo natural-language game was tested on an isolated OpenClaw source build with verified requester identity. The [release handoff](../../docs/campaign-keeper-playable-add-gate.md) records the required host capability and remaining portable Add gates.

The `/ck` command requires host authorization and an owner-capable `operator.write` command scope, `senderIsOwner`, and the host's `assertOwnerCurrent` callback. A narrow WebChat-owner route additionally requires `operator.admin` and keys the game to the host agent/session key and incarnation; WebChat has no channel-plugin binding adapter. Other channels retain the exact plugin-binding checks below. Ordinary non-owner senders fail closed even if the owner approved their sender ID: the public command SDK only provides an after-await current-authority callback for an admitted owner, not for an ordinary authorized sender. A prior `isAuthorizedSender` boolean and UUID possession are not sufficient to revalidate a non-owner before a state mutation. The SDK's later check for model continuation does not guard this command's state writes. Until the SDK exposes a suitable non-owner revalidation path (including an effect guard), there is no safe multiplayer claim. Owner approval is recorded atomically with the game, but cannot enable another player with this SDK. The WebChat route has fixture tests, **not** an authenticated installed Gateway turn.

### Commands

- Start or inspect a campaign with `/ck create [quay-runner|tidehand|lantern-singer] <request-id>`, `approve <sender-id> <request-id>`, `join <game-id> <request-id>`, `look`, `inventory`, `recap`, `scene` (owner-only projection and model continuation).
- Explore with `move <room-id> <request-id>`, `examine <object-id> <request-id>`, `talk <pell|suri|mara> <request-id>`, `take <item-id> <request-id>`, `open tower-stair <request-id>`.
- At the Pump hatch, use `brace pump-lever [safety-line] <request-id>`, `open pump-hatch <request-id>`, `open pump-hatch suri <request-id>`, `risk <pump-hatch|tower-stair> <resolve|surge> <quay|tavern> <request-id>`.
- For checks and recovery, use `roll <grit|wits|charm> <request-id>`, `risk archive-shelf <grit|wits> [nonessential-carried-item] <quay|tavern> <request-id>`, `rest <request-id>`.
- For the finale, use `fit <glass-prism|hand-mirror|improvised> <request-id>`, `warn <boats|market|evacuate> <request-id>`, `finish <balanced|diverted|shuttered|deferred> <request-id>`.

At the Pump House, brace the lever with the weather crate carried from Tide Market, then use `open pump-hatch`. For Suri's help, first commit `talk suri` at Tide Market, then use `open pump-hatch suri` at the Pump House. Both routes open the hatch and relieve pressure without dice. In an earlier save, use a fresh `talk suri` request in the Market to record her offer. From the Archive, the hatch can be opened directly for passage. The Pump-side controls can relieve pressure through an already-open hatch.

To rush an unbraced hatch at the Pump House, state the stakes and have the player choose the mixed-band cost and retreat room before submitting `risk pump-hatch`. The engine rolls 2d6 + Grit.

| Total | Committed Pump result |
| --- | --- |
| 10+ | Opens cleanly. |
| 7–9 | Opens and costs the selected 1 Resolve or +1 surge. |
| 6 or less | Opens noisily and the wheel jams open. Surge rises by 1. |

At surge 2, a surge cost becomes 1 Resolve. At zero Resolve, the open hatch and consequence commit with retreat to the selected room. `rest` restores 2 Resolve after retreat. The hatch, consequences, public journal entry, actual dice and request receipt save together. Resubmit the same command and request ID after an uncertain response to recover its receipt. A completed pressure release refuses another release. The weather crate and carried safety line are supported braces.

For the optional Archive shelf, disclose its fixed stakes before requesting the command. On 7–9, omit the item to spend 1 Resolve, or name a carried nonessential item to leave it on the shelf; it remains recoverable in the Archive. The safety line is excluded from this option. On 6 or less, water takes the satchel, reveals a maintenance route and raises surge; at surge 2 supplies are soaked. The engine commits its roll, effect, journal and receipt together. Tavern rest is tracked once before and once after full stakes discovery. The zero-Resolve breather remains available independently.

A `finish` action requires committed stakes from Mara, the Tavern plate, or the Archive plan. Balanced and diverted require a fitted prism, mirror or informed improvised reflector. Balanced also requires the Pump-side pressure release. Shuttered requires a boats warning and deferred requires an evacuation. Diversion floods the Market run. A prior warning protects its goods. The chosen ending, dial, beacon and consequence commit together and update the game counts. Deferred is a deliberate command.

Only the owner can `approve` a host-scoped sender ID. `join` requires a matching game UUID and prior approval. The current SDK admission gate limits executable actions to the owner. Request IDs identify replay receipts within an actor's actions.

Before reading or writing, the command requires an existing host-resolved plugin conversation binding for this invocation, with binding ID, channel, account, conversation ID and matching thread/parent; it refuses absent/mismatched/changed bindings. Agent/session ID and the exact binding tuple key the game; the retained row also verifies the session key. Nonempty `from` and `to` are required, but the public command context does not itself certify that the raw transport `to` equals the resolved binding destination. Do not claim real-channel destination proof without adapter-level verification. The owner callback is checked after awaited reads, immediately before mutation and after CAS returns; the store's action authority also uses that callback. A binding read is not a transactional guard on the later CAS: revocation/rebinding races between the final lookup and commit still need an SDK-supported binding-current guard or a real adapter-level proof. Thus this remains a capability spike, not an approved channel security boundary.

The new `campaign-keeper-spike-v2` namespace uses a **bounded** 64-row keyed store with `reject-new`, never evict-oldest. Each row allows at most four approvals/players, 64 receipts and 64 KiB of serialized JSON. A full namespace or oversized game refuses new writes; no automatic receipt eviction silently breaks idempotency. The former v1 retained namespace is not opened or migrated by this code; if that code was ever installed, its old rows require separate authorized inventory/retirement. This is not a plugin-wide byte quota across unrelated namespaces, and the storage layer still permits each individual row up to its own cap. A disposable real V2 store-reopen test retained one completed solo game and its ending receipt; no Gateway restart or installed GM test was run.

The trusted host `sessionId` now anchors a distinct incarnation in the same `sessionKey`; `/new` or `/reset` does not inherit the previous game. A missing session ID fails closed. Only accepted `/ck create` commits a row, so opening an empty chat never counts as a game. New saves declare `saveSchemaVersion: 1`; absent, old, or unknown versions refuse reads and writes, including aggregate stats, without resetting the row. No migration of older spike rows is attempted. Rows keyed solely by session key, or rows created before the current fields or schema version existed, fail closed rather than silently reset or become false dashboard zeros. A packaged build was installed only in a task-owned disposable state and booted on a loopback-only Gateway, with no campaign save or restart test. An operator who installed an earlier prototype elsewhere must inventory its rows and review a versioned migration before use; do not erase them. A release still needs migration/recovery decisions for any earlier prototype rows.

An **opt-in, read-only dashboard widget** and `gameStats` plugin session action are registered only when plugin config explicitly supplies `dashboardEnabled: true` and the Campaign Keeper `agentId`. It requires host `operator.read`, the host-resolved session agent matching the configured agent, a live `allowsAgent` check, and `operator.admin` on shared Gateways. It scans at most 64 authoritative retained rows; malformed, incompatible, mixed-agent, or excess rows return unavailable, not misleading zeros. Every result contains only an opaque game ID, ordinal non-sensitive label, player count, accepted action count, totals and an as-of aggregate version; games move from active to completed only on an explicit committed ending. The query does not expose binding, channel, identities, positions or receipts. The native widget presents aggregate counts only, querying the host-selected session through the read-only action. Only disposable plugin-load proof exists, not a rendered host UI, text stats fallback, or live multiplayer; installation and UI reload are separate operator steps. The read scan is not a cross-row snapshot and can race with concurrent commits; the version is an aggregate of observed row versions, not a transactionally consistent checkpoint. A disposable V2 store-reopen proof exists; Gateway restart durability and rendered UI remain unverified.

Focused fake-store tests (not a host runtime or two-identity integration test) from the repository root:
`node --import /home/openclaw/openclaw/node_modules/tsx/dist/loader.mjs --test packages/engine/engine.test.ts`.

The local six-room slice has legal movement, two explicit Archive route openings, room-scoped examination with saved public observations, a limited player-facing text projection, inventory, a public journal, unique item claims and CAS receipts. The prototype also records default archetype attributes and Resolve plus an isolated `roll <attribute> <request-id>` result with engine-generated 2d6 in the receipt; this raw roll **does not** apply encounter consequences or determine a hit/damage outcome. The hidden safety line requires examining the cleat before it can be taken. The fake-CAS item race uses two concurrent requests from **one owner**, not two authenticated players. Three room-checked NPC conversation adapters and Tavern/Market/Archive clue facts are persisted with receipts. The game-creator-only `/ck scene` command reads a bounded committed player projection and hands it to the GM agent through `continueAgent`; it is not an independently observed model turn and does not grant the GM state mutation. Its prompt cannot erase prior chat context or privately held GM source; spoiler-safe **model narration** needs a real agent-level adversarial test, not just this projection assertion. Deterministic look/move/item commands still bypass the model. NPC command text remains deterministic, not open-ended GM dialogue; it does not yet enforce every route through the full cooperative obstacle, free-form character creation, dice-driven NPC/encounter consequences, all clue discovery semantics, complete ending consequences, scene board, or GM tools. An owner can brace the Pump lever with a carried Market weather crate or explicitly use the carried, previously discovered safety line as an improvised alternative. The GM must map a player's proposal to this validated command; other arbitrary objects cannot acquire state effects through narration. The Tower stair opens deterministically, and an optional solo Grit risk opens it on every roll band with the selected 7–9 cost and capped-surge fallback. Two-character leverage coordination is still absent. A unique-item race test uses a fake CAS store, not a live two-player adapter. Missing: real channel identity and destination proof, safe non-owner authorization after awaits, binding-current effect guard, Gateway-restart replay, installed GM/model test, full game mechanics, migration, enrollment UX and immutable released plugin dependency.


## Session-based GM tool adapter

`campaign_keeper_intent` is a V2 tool for the separate GM agent. Players speak naturally;
the GM translates the **current attributed player's request** to `{action, requestId,
target?, gameId?, sourceSessionKey?, choice?, retreat?, item?, helper?}`, then narrates the committed result. `/ck` remains
an optional deterministic debug shortcut, not a required gameplay interface. Unsupported
proposals require clarification/refusal rather than invented state changes.

The session-tool route uses its own destination discriminator and never requires a plugin
conversation binding. It does not import or migrate command-route saves. The same transition
core serves both adapters without manufacturing a `PluginCommandContext`.

A direct owner human turn (absent provenance or unambiguous `external_user` provenance, `senderIsOwner === true`, host
`requesterProfile: {id, assertCurrent}` for WebChat; trusted transport `requesterSenderId`
and `messageChannel` for other channels) can create a game and explicitly enroll an exact
agent source session with `{action:"enroll", sourceSessionKey:"agent:main:player", requestId}`.
The enrolled source sends a `sessions_send` followup to the GM, then joins with the game UUID.
The GM tool derives its agent player from host `inputProvenance` (`kind: inter_session`,
`sourceTool: sessions_send`, `sourceSessionKey`), even when the sponsoring human owner facts
are also present. It cannot select another actor through arguments. Other, incomplete, or
ambiguous provenance rejects; enrollment alone does not create a character until join.
All actions check membership; only the game creator may enroll. Human and agent use separate
actor/replay keys. Scope is one GM session incarnation; resets do not import previous games.

Supported actions reuse the authored engine verbs: create, enroll, join, look, inventory,
recap, move, take, examine, talk, open, brace, fit, roll, risk, rest, finish, warn.
`target` contains a single existing authored target token. Risk uses separate `choice` and
`retreat` fields, with optional `item` for the Archive shelf (for example
`{action:"risk", target:"archive-shelf", choice:"wits", retreat:"quay", requestId:"risk-1"}`).
Pump/Tower choices are `resolve` or `surge`; Archive choices are `grit` or `wits`.
`helper:"safety-line"` supports `brace` on `pump-lever`; `helper:"suri"` supports
`open` on `pump-hatch`. Every field is validated through the authored command parser;
fields on unrelated actions and whitespace injection reject. These fields choose authored
consequences, never player identity. `requestId` is required, including reads; mutation
replays return the original receipt. V2 `assertInvocationCurrent` is passed to
`openKeyedStoreV2` for final state admission, not merely checked before awaited work.

The command adapter retains its owner gates. See the [playtest ledger](../../docs/campaign-keeper-proof.md) for signed-in solo play and the bounded agent-player experiment. Agent enrollment still needs source incarnation and visible delivery proof before a multiplayer release.


### Verified Control UI requester capability requirement

The WebChat tool route now requires a host implementing OpenClaw #189600's proposed
optional `requesterProfile: { id: string, assertCurrent(): void }` capability. The
2026.11.2 host used in the earlier live test did not supply this fact; its owner bit
alone is deliberately insufficient. This is a capability requirement, not a claim
that #189600 is merged or available in a released version. The adapter uses a narrow
structural extension so older SDKs compile, but older hosts fail closed at runtime.

Direct WebChat actors are keyed by the exact verified profile ID, not display name,
`gateway-owner`, generic SenderId, or owner status. The profile assertion is composed
with invocation currency around awaited transitions, receipt replay and the actual
V2 storage admission. Other channels retain their host-supplied transport sender keys.
Inter-session player attribution remains source-session based even with a sponsoring
profile present. Owner-only enrollment and membership checks are unchanged. Existing
experimental human transport-key saves are not automatically reassigned to a profile.
Storage/authority exception text is not returned in tool results; only a bounded
rejection category and non-identity context-presence diagnostics remain.

The profile consumer passed 65 engine/world/rules/browser fixture tests, including
missing/malformed profile, non-owner, replay, profile revocation after a read and at
final write, distinct agent attribution, and private exception suppression. These are
fixtures against the proposed capability shape, not host PR integration or live proof.
No host update, isolated deployment, restart, or production change accompanied this edit.
