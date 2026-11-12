# Campaign Keeper dashboard and game-session model

**Status:** design for the unreleased engine; not a live dashboard or a claim of tested multiplayer.

## Requested behavior

The Campaign Keeper Agent Template should offer an **opt-in OpenClaw dashboard** that tracks game statistics across games. A new Campaign Keeper game session is a new game; the same game session can contain several authenticated players without creating a new game per player. This applies to Campaign Keeper sessions, not every OpenClaw session on the Gateway.

- The authoritative engine creates a game record only upon an accepted game-start/create operation in a distinct host conversation incarnation. Merely opening an empty chat does not inflate the game count. Use the trusted `(agentId, sessionId)` as the default incarnation anchor, plus an engine game ID; `sessionKey` alone can survive `/new` or `/reset` and must not conflate distinct games. Resuming the same incarnation loads its existing game, and retries return its receipt. A deliberately new Campaign Keeper session or reset can start a new game after an accepted start operation. Channel/thread bindings are additional authority checks, not a substitute for session identity.
- A group/channel/thread that is approved for multiplayer has one shared game session/binding. Different messages or players in that binding do not start new games. If a channel adapter maps one physical group to multiple host session keys, resolve that mapping before enabling multiplayer; never merge them by display name or silently count each player's turn as a campaign.
- Store game totals from **committed engine records**, not LLM memory, transcript text, widgets, or raw chat events. A failed creation does not count. Retrying a committed create is counted once. Archive/ending changes status, not historical identity; never delete history silently.
- Default dashboard is **off**. An owner/operator may enable a read-only stats view for the Campaign Keeper agent after installing a reviewed engine release. Do not widen the GM's player-facing tools or change global Control UI settings merely to enable it. Enabling the view never enables gameplay or exposes an external endpoint.

## Read model and privacy

A safe owner-facing projection can show: total games, active/completed games, accepted action count, player count per game, discoveries/endings once committed, and last committed activity. Each row is identified by an opaque game ID and a non-sensitive label; no private channel IDs, player IDs/names, raw chat, GM spoilers, secret flags, credentials, or full inventory. Avoid per-player ranking unless separately requested. Show an as-of version/time and explicit partial/unavailable status for corrupt, incompatible or capacity-blocked storage.

Scope the query to the executing Campaign Keeper agent and an authorized operator reader; recheck current agent access for every included record, not merely a supplied agent ID or `operator.read` scope. Do not aggregate another agent's state or reveal owner-only stats to ordinary players. Keep the dashboard query read-only and bounded. Derive totals from a bounded retained/capacity-safe game index or aggregate, with atomic same-owner settlement of create/result changes; do not use a second independently updated save that can drift from the authoritative game record. If the public state API cannot atomically update multiple records, prefer a bounded scan of committed game rows for the first release and state explicit row/capacity limits; reject new games at capacity rather than evicting them. Never treat a missing or unreadable row as zero silently.

## OpenClaw UI contract and enablement

The installed 2026.11.2 feature-plugin docs describe backend feature queries with `operator.read`, matching backend `api.session.controls.registerControlUiDescriptor({ surface: "widget", ... })`, and a browser `host.ui.registerWidget(...)`. The browser view must request only a validated player-safe/owner-stats projection through the feature client; it must not read state directly or embed secrets in DOM. Native plugin UI runs trusted code in the Control UI origin, so review its permissions and build artifact. If native UI is disabled by the host's explicit advanced opt-out, fall back to a text stats command or a bounded read-only summary; do not override the host setting. A sandboxed dashboard widget may be preferable if the native code authority is unnecessary. Confirm the exact supported integration against the installed SDK before implementation.

Enablement should be an engine-owned owner setting or host-supported per-agent widget selection, not a package lifecycle hook. The Agent Template should document how to opt in after a real exact-version engine dependency exists. It cannot promise a working dashboard while `packages: []` and no engine release remain.

## Acceptance tests (still required)

1. Start game A in session A; confirm one committed game. Reopen/retry A; count remains one. Start game B in a distinct authorized session; aggregate total becomes two. An empty session and failed start do not count.
2. Two authenticated players acting in A affect A's stats, not new game rows. A wrong campaign/agent/reader cannot query or mutate another campaign's stats.
3. End A, then reload dashboard and restart an owned disposable host: A remains counted as completed, B remains active, and read models match committed state.
4. Disable dashboard; gameplay continues and no widget is exposed. Enable only for authorized reader; ordinary player projection contains no GM notes, unvisited clues, private identities or channel IDs.
5. Verify actual rendered widget and text fallback, with correct as-of/version after a committed action and honest stale/unavailable handling. Fixture screenshots are not browser proof.
