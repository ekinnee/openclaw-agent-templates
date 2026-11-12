# Lantern rules and state contract (GM / engine implementer)

Use with the full GM adventure. These are content semantics for an eventual authoritative engine, **not implemented persistence or authorization** in this template.

## Characters and actions

For 1–4 characters, assign +2, +1, 0 among Grit (force/endurance), Wits (observation/repair), Charm (persuasion/reassurance); start at six Resolve with a concept and sensible effects. Quay Runner (+1/+2/0; oilcloth coat, notebook) is ready to play; Tidehand (+2/+1/0) and Lantern Singer (0/+1/+2) are alternatives. No backstory is compulsory. A player controls their character, never another player's character. No real-time tick or simultaneous attendance requirement.

For meaningful uncertainty, state benefit and specific risk *before* a real engine-generated 2d6+attribute roll. 10+: clean success. 7–9: success with a pre-stated cost (1 Resolve, +1 surge, or leaving a tool; let the player choose where both fit). 6−: complication that advances play, including an essential clue or another route. Never gate essential clues or exits behind one successful roll. No roll for an open exit, observation, conversation, available clue, or uncontested object. Encounters use this rule, not separate combat. Consequences are non-graphic. At zero Resolve, commit the effect first, then retreat to Quay or Tavern at the player's choice; a breather returns them to 2 Resolve without loss of unique quest items or knowledge. Tavern rest restores 2 (up to six) once before and once after the central discovery per character; zero-Resolve breather still works.

Surge starts at 0. Only explicitly named noisy/slow complications raise it, capped at 2. At 2 the low quay floods shallowly; dry ledges and rope preserve every exit and ending. Later surge costs mean soaked supplies or 1 Resolve, never unwinnable flood. No advancement for inactivity.

## Committed state

One campaign includes membership/binding, world version, per-character room, attributes, Resolve, inventory, visited rooms and rest use; public journal with source/discoverer and committed effects; world facts `surge` 0–2, `plate_read`, `market_pattern_heard`, `archive_plan_read`, `balance_known`, `archive_access` none/pump/stair/both, `pump_braced`, `pressure_relieved`, `prism_taken`, `tower_lens` dark/ready/lit, `dial` unset/balanced/diverted/shut and `ending` none/balanced/diverted/shuttered/deferred. Track unique hand mirror, prism, safety line, crate and twine with exactly one owner/location. A single character's discovery is not automatically everyone's personal knowledge; share explicitly or enter the public journal. Record actual dice and outcome with an action receipt. Replay returns the saved receipt/roll, never a second effect. Record first Pump lever holder as cancellable pending intention; a second present character or Suri/crate may complete it later. Nobody must type at the same instant.

A reflector supplies the beacon optics. The Pump-side HOLD/RELEASE controls vent the trapped pressure with Suri, a brace, or a risky solo action. The far-side Archive latch grants passage. BALANCE needs both a fitted reflector and a completed pressure release. DIVERT can light the fitted beacon sooner and floods the Market run even if a warning protects its goods.

Before any mutation, the future engine must verify trusted caller identity, campaign and conversation binding, membership, ownership, room, and operation scope at its state boundary. Commit mutually exclusive claims atomically and reconcile uncertain requests; prose cannot substitute for these guarantees. Avoid guessed identities or cross-campaign merges. On unreadable/incompatible state, stop rather than reset. No model recollection as save. Do not treat this rulebook as proof that those mechanisms exist.

## Presentation

Produce fresh player-facing `look`, `examine`, inventory, journal and recap from committed authorized state. Current room visible text, current exits and visible blocking conditions, objects, NPCs, same-room characters, status, objectives and as-of version may appear; omit other rooms' hidden contents, unrevealed clues and endings, GM audit, and other characters' private inventory entirely. A character may communicate a clue; do not imply they personally observed a clue that was only shared. An old board is an explicitly versioned snapshot with text equivalent. GM source is not a player handout or an HTML/JSON payload for redaction.
