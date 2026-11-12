# Campaign Keeper — themed games and combat evolution

**Status:** user-requested future scope, to pursue after the current bounded engine spike. This is a proposal, not implemented mechanics or authorization to install/publish. Keep the authored Lantern Below starter as a stable first-game/test fixture.

## New game from a theme

At a new Campaign Keeper game start, offer **Lantern Below** or **Generate from a theme**. A theme is a creative seed, not executable authority. The GM may draft a new finite room graph, story premise, characters/NPCs, items, encounters and endings, but the engine must validate a versioned world specification before accepting and persisting it. Reject cycles/locks that make essential clues or endings unreachable, duplicate unique IDs, invalid exits, missing alternatives, unbounded text or prohibited content. Save the accepted world spec and generation provenance with the game: reopening or retrying resumes the same world rather than regenerating it. Different game session incarnations may have different worlds; aggregate stats span them only within the authorized agent. Offline/model failure should still permit an authored-world start. Generated text must not become instructions to the host or expand GM tool authority. No procedural generation or new world appears in the current spike.

Keep hidden GM content separate from player projections. A generated encounter can define a creature and its stakes, but no creature/item/room becomes authoritative until accepted by the engine. The GM narrates from the committed world and never grants loot, kills, discoveries or victory by prose alone.

## Stats semantics

Expand the opt-in owner stats dashboard using committed engine events, not transcript parsing. Define counters carefully before implementation:

- **Items collected:** successful unique item acquisition events (or explicitly choose distinct items vs total pickups); a retry never increments twice. A transfer is not necessarily a new discovery.
- **Monsters defeated:** encounters resolved as defeated; peaceful resolutions should be tracked separately rather than counted as kills. If a game permits lethal outcomes, track kills explicitly and only after a committed result.
- **Rooms cleared:** a room-specific objective completed, not merely visited or emptied of every object. Generated worlds must carry completion criteria.
- **Games won:** a committed winning ending; distinguish other endings, abandonment and sessions merely paused.
- **Deaths:** only if a later agreed ruleset introduces character death. The current default at zero Resolve is a nonlethal retreat, so deaths remain zero/not applicable, not inferred from Resolve reaching zero.

Use stable event IDs and saved receipts so retries and a dashboard refresh do not double-count. Count across games scoped to the authorized Campaign Keeper agent; show per-game and overall totals with an as-of version. Keep identifiers, spoilers, raw player records and private channels out of broad widgets. Define whether statistics persist after an agent or game is archived; never silently evict history.

## Combat decision to settle before implementation

The v0.1 Lantern rules intentionally use **six Resolve**, not conventional HP. A meaningful attack is a stated-stakes `2d6 + Grit/Wits/Charm` action: 10+ succeeds cleanly, 7–9 succeeds with an announced cost, 6− adds a complication. The engine rolls, resolves and commits; it does not use a separate hit percentage, armor class or damage die. Resolve loss represents strain, and at zero the character retreats and can recover. This supports non-graphic adventure and negotiation but is not a numerical combat game.

If Erick wants HP, hit chance and damage, design an **optional rules profile** rather than silently overlaying numbers on Resolve. Proposed small profile for discussion: a bounded HP pool, one 2d6 attack resolution with a target/defense, fixed or small-die damage, limited armor mitigation, explicit monster HP and status, healing/recovery rules, and defined downed/death policy. Specify whether hit chance is derived from the dice distribution rather than a separate random percentage; avoid two independent rolls for one strike unless intentionally chosen. Make encounter rewards and defeat/kill semantics match dashboard counters. Test edge cases: zero/negative HP, simultaneous actions, damage bounds, repeated request IDs returning identical rolls/damage, wrong-room targets, and model narration failure after commit.

Before implementing either combat profile, decide tone/lethality, desired crunch, solo balance and whether nonlethal victory remains first-class. The current spike does not yet implement even the Resolve encounter operations, so numerical combat cannot be presented as running behavior.
