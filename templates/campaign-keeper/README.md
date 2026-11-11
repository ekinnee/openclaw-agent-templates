# Campaign Keeper — content preview, not portable Add-ready

A text-first cooperative coastal adventure for 1–4 characters, with a six-room starter world, original 2d6 rules, three NPCs, multiple clue routes, a cooperative hatch, four accountable endings and an original lantern creature SVG. The GM source is private adventure material, **not** a player handout. Created with Erick Kinnee; contents and illustration are original under MIT.

**Dependency gap:** The authoritative Campaign Keeper engine plugin has not been released. This manifest deliberately does not invent a ClawHub package or version; `packages: []` is a staging placeholder, **not** a declaration that the adventure works without the engine. Portable `templates add .` is blocked as a playable install. It could create a narration-only agent, not the persistent owner-only solo game; do not use it as proof. There is no state owner, command adapter, roll receipt, player authorization, durable save, or scene board in this directory. The host's model/provider/credentials are not selected by this package.

## Local authoring checks (safe; no Add)

With a matching OpenClaw CLI available, from this directory:

```bash
openclaw templates validate .
openclaw templates dev . --json
openclaw templates build . --out /tmp/campaign-keeper-0.1.0.tgz
```

`dev` checks package structure and locally declared requirements, **not** the absent engine or an Add. `build` refuses to overwrite an existing archive; choose a new output path for another run. Inspect the archive contents before any publication. An archive is a publication artifact, not the local Add input. Neither a successful build nor this Git repository publishes to ClawHub.

## Contents and intended play

- `CLAW.md`, `workspace/AGENTS.md`, `BOOTSTRAP.md`: GM role, spoiler/authority limits, first-run behavior.
- `rules/lantern-rules.md`: attributes, Resolve, surge and state semantics for an eventual engine.
- `adventures/the-lantern-below/GM.md`: complete private six-room adventure, visible text, NPCs, clues, exits, objects, cooperative obstacle, outcomes, and player projection contract.
- `profiles/openclaw.yml`: **preview-only** workspace-scoped reading. `profile: full` names a profile, not an unrestricted grant; its allowlist is just `read`. It does not grant game tools, shell, file writing, messaging or browser access. Revisit it against the actual released engine's supported tool names before Add. Host policy may further restrict grants.
- `avatars/blobster.svg`: original harbor creature, no reused base geometry. `tests/acceptance.md`: acceptance cases, not runtime evidence.

The starter scene is Lantern Quay: a dark beacon and three uneven bell notes. A Quay Runner (+1 Grit, +2 Wits, 0 Charm, six Resolve) can start immediately after one tone preference check. A player might read the Crooked Compass plate, or listen with Suri in Tide Market, or reach the Archive through the Pump hatch or Tower stair. The tower's lamplighter Mara can also explain the choice. The player decides whether to balance and light both banks, divert water and save the low quay, shut the light and warn the boats, or warn/evacuate while deferring repairs. Pause is **not** that last ending.

The story's rules describe intent, not implementation. For the first **owner-only solo** release, the engine must admit the authenticated owner on an approved conversation, enforce room/item checks, atomically commit dice and action receipts, recover saves across restart, and supply safe player projections. Its deterministic commands must work without the model; narration must not forge state. If the optional stats board ships, it needs as-of/version text and rendered-browser proof. Distinct non-owner player admission and two-person tests belong to the later multiplayer release, after the upstream binding-current guard is released and adopted. No authenticated GM play or Gateway restart proof is claimed here.

## Optional OpenClaw game-stats dashboard (planned)

An owner may opt into an engine-backed, read-only dashboard for aggregate game stats after the engine and its verified UI component are released. A newly **started game in a distinct Campaign Keeper session** counts once; reopening or retrying that session does not. Several players sharing one approved game session belong to one game. The dashboard would show committed game counts and outcomes with as-of/version information, not transcript-derived estimates, raw player/channel identities, or unrevealed GM notes. It is **not included or enabled by this preview Template**, and neither an empty OpenClaw chat nor every new player message is a new game. The design and acceptance criteria are in the repository's `docs/campaign-keeper-dashboard.md`. Do not enable native plugin UI or claim stats support solely from this template build.

## Release gate

For the **solo-first release**, first prove the installed engine with one authenticated owner: owner-issued `/ck` actions, GM narration after receipts, pause/restart/replay, model-outage deterministic commands, and spoiler-safe player text. Then publish a reviewed exact immutable engine version, declare its real `kind: plugin`, `source: clawhub`, `ref` and `version` in `CLAW.md`, and validate/dev/build plus test a fresh isolated Add that installs or reuses that dependency. Keep owner-only admission explicit on ClawHub. Two-person non-owner proof is a later multiplayer upgrade gate, not a condition for the honest solo release. Do not loosen shared Gateway controls or invent a package reference.
