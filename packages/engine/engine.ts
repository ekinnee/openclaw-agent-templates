// Narrow deterministic command owner. No model, filesystem writes, or player-facing GM material.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { PluginCommandContext, OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import type { PluginSessionActionContext } from "openclaw/plugin-sdk/plugin-entry";
import { canMove, examine, initialWorld, itemId, itemIds, roomId, rooms, talk, viewRoom, type ItemId, type RoomId, type WorldState } from "./world.js";
import { applyResolve, roll, validAttributes, type Attribute, type Attributes, type Roll } from "./rules.js";
import { archetypes, archetypeIds, isArchetype, type Archetype } from "./characters.js";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/tool-plugin";
import { isIncognitoSessionKey } from "openclaw/plugin-sdk/session-key-runtime";

export type Store = PluginStateKeyedStore<Game, 2>;
export type LaunchSession = { agentId: string; sessionKey: string; sessionId: string; lifecycleRevision?: string };
export type LaunchRoute = { keeper: LaunchSession; player: LaunchSession; profileId: string; assertCurrent: () => void };
type Position = RoomId;
type Receipt = { fingerprint: string; text: string; roll?: Roll };
type Game = {
  saveSchemaVersion: 1;
  id: string;
  agentId: string;
  sessionId: string;
  sessionKey: string;
  destination: string;
  owner: string;
  starterSession?: LaunchSession;
  approved: Record<string, true>;
  players: Record<string, Position>;
  attributes: Record<string, Attributes>;
  resolve: Record<string, number>;
  rests: Record<string, { before: boolean; after: boolean }>;
  inventory: Record<string, ItemId[]>;
  world: WorldState;
  receipts: Record<string, Receipt>;
  version: number;
};
type Command = { verb: "create" | "approve" | "join" | "look" | "move" | "take" | "inventory" | "examine" | "talk" | "open" | "brace" | "fit" | "recap" | "roll" | "risk" | "rest" | "finish" | "warn"; requestId?: string; direction?: Position; gameId?: string; sender?: string; target?: string };

const token = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_GAME_BYTES = 65536;
const MAX_PLAYERS = 4;
const MAX_RECEIPTS = 64;
function parse(args: string | undefined): Command | null {
  const words = (args ?? "").trim().split(/\s+/);
  if (words[0] === "look" && words.length === 1) return { verb: "look" };
  if (words[0] === "inventory" && words.length === 1) return { verb: "inventory" };
  if (words[0] === "recap" && words.length === 1) return { verb: "recap" };
  if (words[0] === "examine" && words.length === 3 && token.test(words[1]) && token.test(words[2])) return { verb: "examine", target: words[1], requestId: words[2] };
  if (words[0] === "talk" && words.length === 3 && ["pell", "suri", "mara"].includes(words[1]) && token.test(words[2])) return { verb: "talk", target: words[1], requestId: words[2] };
  if (words[0] === "create" && words.length === 2 && token.test(words[1])) return { verb: "create", requestId: words[1] };
  if (words[0] === "create" && words.length === 3 && isArchetype(words[1]) && token.test(words[2]))
    return { verb: "create", target: words[1], requestId: words[2] };
  if (words[0] === "approve" && words.length === 3 && words[1].length <= 256 && words[1].trim() && token.test(words[2]))
    return { verb: "approve", sender: words[1], requestId: words[2] };
  if (words[0] === "join" && words.length === 3 && /^[0-9a-f-]{36}$/.test(words[1]) && token.test(words[2]))
    return { verb: "join", gameId: words[1], requestId: words[2] };
  if (words[0] === "move" && words.length === 3 && roomId(words[1]) && token.test(words[2]))
    return { verb: "move", direction: words[1] as Position, requestId: words[2] };
  if (words[0] === "take" && words.length === 3 && itemId(words[1]) && token.test(words[2]))
    return { verb: "take", target: words[1], requestId: words[2] };
  if (words[0] === "open" && words.length === 3 && (words[1] === "pump-hatch" || words[1] === "tower-stair") && token.test(words[2]))
    return { verb: "open", target: words[1], requestId: words[2] };
  if (words[0] === "open" && words.length === 4 && words[1] === "pump-hatch" && words[2] === "suri" && token.test(words[3]))
    return { verb: "open", target: "pump-hatch:suri", requestId: words[3] };
  if (words[0] === "brace" && words.length === 3 && words[1] === "pump-lever" && token.test(words[2]))
    return { verb: "brace", target: words[1], requestId: words[2] };
  if (words[0] === "brace" && words.length === 4 && words[1] === "pump-lever" && words[2] === "safety-line" && token.test(words[3]))
    return { verb: "brace", target: "pump-lever:safety-line", requestId: words[3] };
  if (words[0] === "fit" && words.length === 3 && ["glass-prism", "hand-mirror", "improvised"].includes(words[1]) && token.test(words[2]))
    return { verb: "fit", target: words[1], requestId: words[2] };
  if (words[0] === "roll" && words.length === 3 && ["grit", "wits", "charm"].includes(words[1]) && token.test(words[2]))
    return { verb: "roll", target: words[1], requestId: words[2] };
  if (words[0] === "risk" && words.length === 6 && words[1] === "archive-shelf" &&
      ["grit", "wits"].includes(words[2]) && itemIds.includes(words[3] as ItemId) && words[3] !== "safety-line" &&
      ["quay", "tavern"].includes(words[4]) && token.test(words[5])) {
    return { verb: "risk", target: `archive-shelf:${words[2]}:${words[4]}:${words[3]}`, requestId: words[5] };
  }
  if (words[0] === "risk" && words.length === 5 && ["quay", "tavern"].includes(words[3]) && token.test(words[4])) {
    const [, hazard, choice, retreatRoom, requestId] = words;
    if ((hazard === "archive-shelf" && ["grit", "wits"].includes(choice)) ||
        (["pump-hatch", "tower-stair"].includes(hazard) && ["resolve", "surge"].includes(choice))) {
      return { verb: "risk", target: `${hazard}:${choice}:${retreatRoom}`, requestId };
    }
  }
  if (words[0] === "rest" && words.length === 2 && token.test(words[1]))
    return { verb: "rest", requestId: words[1] };
  if (words[0] === "finish" && words.length === 3 && ["balanced", "diverted", "shuttered", "deferred"].includes(words[1]) && token.test(words[2]))
    return { verb: "finish", target: words[1], requestId: words[2] };
  if (words[0] === "warn" && words.length === 3 && ["boats", "market", "evacuate"].includes(words[1]) && token.test(words[2]))
    return { verb: "warn", target: words[1], requestId: words[2] };
  return null;
}

function identity(ctx: PluginCommandContext) {
  // This registered command context does not expose non-owner authorization revalidation.
  // Channel-inbound authorization has a separate assertAuthorizedCurrent callback, but
  // it is not handed to this command. Keep non-owner effects closed here.
  const webchatOwner = ctx.channel === "webchat" && ctx.gatewayClientScopes?.includes("operator.admin") === true &&
    ctx.sessionKey?.startsWith(`agent:${ctx.agentId}:`) === true;
  if (!ctx.isAuthorizedSender || !ctx.senderIsOwner || !ctx.assertOwnerCurrent ||
      !ctx.senderId?.trim() || ctx.senderId.length > 256 || !ctx.agentId?.trim() ||
      !ctx.sessionKey?.trim() || !ctx.sessionId?.trim() || !ctx.channel?.trim() ||
      (!webchatOwner && !ctx.accountId?.trim())) return null;
  return {
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
    channel: ctx.channel,
    accountId: webchatOwner ? "webchat-owner" : ctx.accountId!,
    actor: JSON.stringify([ctx.channel, webchatOwner ? "webchat-owner" : ctx.accountId, ctx.senderId]),
  };
}
type Identity = NonNullable<ReturnType<typeof identity>>;
function destination(ctx: PluginCommandContext, id: Identity, binding: Awaited<ReturnType<PluginCommandContext["getCurrentConversationBinding"]>>): string | null {
  // WebChat has an authenticated operator but no channel-plugin binding adapter. Keep this
  // route distinct from external channels and require a live admitted owner invocation.
  if (ctx.channel === "webchat") return ctx.gatewayClientScopes?.includes("operator.admin") === true &&
    ctx.sessionKey?.startsWith(`agent:${id.agentId}:`) && ctx.sessionId === id.sessionId
      ? JSON.stringify(["webchat-owner", id.agentId, id.sessionKey, id.sessionId]) : null;
  // The host's resolved, approved conversation binding is authoritative. Raw from/to,
  // nullable transport fields and a session key alone cannot identify a destination.
  if (!binding || !binding.bindingId?.trim() || !binding.conversationId?.trim() ||
      binding.channel !== id.channel || binding.accountId !== id.accountId ||
      !ctx.to?.trim() || !ctx.from?.trim() ||
      (binding.threadId == null ? ctx.messageThreadId != null : String(binding.threadId) !== String(ctx.messageThreadId)) ||
      (binding.parentConversationId ?? null) !== (ctx.threadParentId ?? null)) return null;
  return JSON.stringify([binding.bindingId, binding.channel, binding.accountId,
    binding.conversationId, binding.parentConversationId ?? null, binding.threadId == null ? null : String(binding.threadId),
    ctx.from, ctx.to]);
}
async function currentDestination(ctx: PluginCommandContext, id: Identity): Promise<string | null> {
  return destination(ctx, id, ctx.channel === "webchat" ? null : await ctx.getCurrentConversationBinding());
}
function bound(game: Game, id: Pick<Identity, "agentId" | "sessionId" | "sessionKey">, target: string): boolean {
  return game.agentId === id.agentId && game.sessionId === id.sessionId &&
    game.sessionKey === id.sessionKey && game.destination === target;
}
function describe(game: Game, actor: string): string {
  return `${viewRoom(game.world, game.players[actor], actor)} Game ${game.id}; version ${game.version}.`;
}
function receiptKey(actor: string, requestId: string): string { return JSON.stringify([actor, requestId]); }
function fingerprint(cmd: Command): string { return JSON.stringify([cmd.verb, cmd.gameId ?? null, cmd.direction ?? null, cmd.sender ?? null, cmd.target ?? null]); }
const help = "Usage: /ck create [quay-runner|tidehand|lantern-singer] <id> | approve <sender> <id> | join <game> <id> | look | move <room> <id> | take <item> <id> | examine <object> <id> | talk <pell|suri|mara> <id> | inventory | recap | brace pump-lever [safety-line] <id> | open <pump-hatch|tower-stair> <id> | open pump-hatch suri <id> | fit <glass-prism|hand-mirror|improvised> <id> | roll <grit|wits|charm> <id> | risk archive-shelf <grit|wits> [carried-item] <quay|tavern> <id> | risk <pump-hatch|tower-stair> <resolve|surge> <quay|tavern> <id> | rest <id> | warn <boats|market|evacuate> <id> | finish <balanced|diverted|shuttered|deferred> <id>";
const denied = "Campaign Keeper: unavailable or not authorized for this conversation.";
/** A narration request contains only a committed player-facing view, never the GM source or save row. */
export async function scenePrompt(ctx: PluginCommandContext, store: Store): Promise<string | null> {
  const id = identity(ctx);
  if (!id || !store.observe || (ctx.channel !== "webchat" && !ctx.getCurrentConversationBinding)) return null;
  ctx.assertOwnerCurrent!();
  const target = await currentDestination(ctx, id);
  ctx.assertOwnerCurrent!();
  if (!target) return null;
  const key = JSON.stringify([id.agentId, id.sessionId, target]);
  const { value: game } = await store.observe(key);
  ctx.assertOwnerCurrent!();
  if (!game || !bound(game, id, target) || !validGame(game, key) || game.owner !== id.actor || !Object.hasOwn(game.players, id.actor)) return null;
  if (await currentDestination(ctx, id) !== target) return null;
  ctx.assertOwnerCurrent!();
  const projection = {
    scene: viewRoom(game.world, game.players[id.actor], id.actor),
    resolve: game.resolve[id.actor],
    inventory: game.inventory[id.actor],
    recentPublicEvents: game.world.journal.slice(-4),
    ending: game.world.ending,
    asOfVersion: game.version,
  };
  return `Campaign Keeper scene request. Narrate briefly from this committed player projection only; do not invent a roll, item, movement, NPC decision, new clue, consequence, or player action. Ask what the player does next. Projection (JSON): ${JSON.stringify(projection)}`;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validGame(game: Game, key: string): boolean {
  if (!record(game) || !record(game.players) || !record(game.approved) || !record(game.receipts) ||
      game.saveSchemaVersion !== 1 ||
      !record(game.inventory) || !record(game.attributes) || !record(game.resolve) || !record(game.rests) || !record(game.world) || !record(game.world.items) || !record(game.world.flags) || !record(game.world.clues) ||
      !Array.isArray(game.world.journal) || game.world.journal.length > MAX_RECEIPTS ||
      !["none", "balanced", "diverted", "shuttered", "deferred"].includes(game.world.ending) ||
      !["unset", "balanced", "diverted", "shut"].includes(game.world.dial) ||
      !["dark", "lit"].includes(game.world.beacon) ||
      !["none", "glass-prism", "hand-mirror", "improvised"].includes(game.world.reflector) ||
      !Number.isInteger(game.world.surge) || game.world.surge < 0 || game.world.surge > 2 ||
      !game.world.journal.every((entry) => typeof entry === "string" && entry.length <= 256) ||
      typeof game.id !== "string" || !/^[0-9a-f-]{36}$/.test(game.id) ||
      typeof game.agentId !== "string" || typeof game.sessionId !== "string" || typeof game.destination !== "string" ||
      key !== JSON.stringify([game.agentId, game.sessionId, game.destination]) ||
      !Number.isSafeInteger(game.version) || game.version < 1 || game.version > MAX_RECEIPTS ||
      Object.keys(game.receipts).length !== game.version || Object.keys(game.players).length < 1 || Object.keys(game.players).length > MAX_PLAYERS ||
      Object.keys(game.approved).length > MAX_PLAYERS || Buffer.byteLength(JSON.stringify(game), "utf8") > MAX_GAME_BYTES) return false;
  if (typeof game.owner !== "string" || !Object.hasOwn(game.players, game.owner) || game.approved[game.owner] !== true ||
      Object.keys(game.inventory).length !== Object.keys(game.players).length ||
      Object.keys(game.attributes).length !== Object.keys(game.players).length ||
      Object.keys(game.resolve).length !== Object.keys(game.players).length ||
      Object.keys(game.rests).length !== Object.keys(game.players).length) return false;
  for (const [actor, room] of Object.entries(game.players)) {
    if (!roomId(room) || game.approved[actor] !== true || !validAttributes(game.attributes[actor]) ||
        !Number.isInteger(game.resolve[actor]) || game.resolve[actor] < 0 || game.resolve[actor] > 6 || !Array.isArray(game.inventory[actor]) ||
        !game.inventory[actor].every(itemId) || new Set(game.inventory[actor]).size !== game.inventory[actor].length) return false;
    if (!record(game.rests[actor]) || typeof game.rests[actor].before !== "boolean" || typeof game.rests[actor].after !== "boolean") return false;
  }
  if (Object.values(game.world.flags).some((flag) => typeof flag !== "boolean") ||
      ["pumpOpen", "stairOpen", "lineFound", "pumpBraced", "boatsWarned", "marketWarned", "evacuated", "archiveShelfSettled"].some((flag) => typeof game.world.flags[flag] !== "boolean")) return false;
  if (game.world.flags.pressureRelieved && !game.world.flags.pumpOpen) return false;
  if (["plateRead", "marketPatternHeard", "archivePlanRead", "balanceKnown", "stakesKnown"].some((clue) => typeof game.world.clues[clue] !== "boolean")) return false;
  for (const item of itemIds) {
    const holder = game.world.items[item];
    if (typeof holder !== "string" || (!roomId(holder) && !Object.hasOwn(game.players, holder))) return false;
    const ownedBy = Object.entries(game.inventory).filter(([, inventory]) => Array.isArray(inventory) && inventory.includes(item));
    if (roomId(holder) ? ownedBy.length !== 0 : ownedBy.length !== 1 || ownedBy[0][0] !== holder) return false;
  }
  for (const receipt of Object.values(game.receipts)) {
    if (!record(receipt) || typeof receipt.fingerprint !== "string" || typeof receipt.text !== "string" ||
        receipt.fingerprint.length > 512 || receipt.text.length > 4096) return false;
  }
  return true;
}

/** Pure owner over an action-bound V2 state store; a conflict is the only retryable outcome. */
export async function runCommand(ctx: PluginCommandContext, store: Store, die?: () => number): Promise<string> {
  const id = identity(ctx);
  if (!id || !store.observe || !store.compareAndApply || (ctx.channel !== "webchat" && !ctx.getCurrentConversationBinding)) return denied;
  const cmd = parse(ctx.args);
  if (!cmd) return help;
  // Resolve *this invocation's* destination through the host, not user text.
  ctx.assertOwnerCurrent!();
  const target = await currentDestination(ctx, id);
  ctx.assertOwnerCurrent!();
  if (!target) return denied;
  return runTransition(id, target, cmd, store, {
    assertCurrent: ctx.assertOwnerCurrent!, destination: () => currentDestination(ctx, id),
  }, die);
}

type TransitionAuthority = {
  assertCurrent: () => void;
  destination: () => Promise<string | null>;
  approvedActor?: (sourceSessionKey: string) => string;
  starterSession?: LaunchSession;
};
function sameLaunchSession(a: LaunchSession | undefined, b: LaunchSession | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.agentId === b.agentId && a.sessionKey === b.sessionKey && a.sessionId === b.sessionId &&
    a.lifecycleRevision === b.lifecycleRevision;
}
async function runTransition(id: Identity, target: string, cmd: Command, store: Store,
  authority: TransitionAuthority, die?: () => number): Promise<string> {
  // The namespace is retained. Agent and conversation identity are both part of the key,
  // and the stored binding must still match before any response or effect.
  const key = JSON.stringify([id.agentId, id.sessionId, target]);
  let riskRoll: Roll | undefined;
  for (let attempts = 0; attempts < 5; attempts++) {
    authority.assertCurrent();
    const observed = await store.observe(key);
    authority.assertCurrent();
    if (await authority.destination() !== target) return denied;
    authority.assertCurrent();
    const current = observed.value;
    if (cmd.gameId && cmd.gameId !== current?.id) return denied;
    if (current && (!bound(current, id, target) || !sameLaunchSession(current.starterSession, authority.starterSession))) return denied;
    // A prior prototype's row is not a valid world save; never silently reset it.
    if (current && !validGame(current, key)) return denied;
    if (cmd.verb === "look") {
      if (!current || !Object.hasOwn(current.players, id.actor)) return denied;
      authority.assertCurrent();
      return describe(current, id.actor);
    }
    if (cmd.verb === "inventory" || cmd.verb === "recap") {
      if (!current || !Object.hasOwn(current.players, id.actor)) return denied;
      if (await authority.destination() !== target) return denied;
      authority.assertCurrent();
      if (cmd.verb === "inventory") return `Inventory: ${current.inventory[id.actor]?.join(", ") || "empty"}. Version ${current.version}.`;
      if (cmd.verb === "recap") return `Public journal: ${current.world.journal.slice(-8).join("; ") || "no discoveries"}. Ending: ${current.world.ending}. Version ${current.version}.`;
    }
    const rkey = receiptKey(id.actor, cmd.requestId!);
    const prior = current?.receipts[rkey];
    if (prior) {
      if (prior.fingerprint !== fingerprint(cmd)) return "Request id already used for another action.";
      if (cmd.verb === "join" && cmd.gameId !== current?.id) return denied;
      authority.assertCurrent();
      return prior.text;
    }
    let next: Game;
    let text: string;
    if (cmd.verb === "create") {
      if (current) return "A game already exists in this conversation.";
      const attributes = archetypes[isArchetype(cmd.target) ? cmd.target : "quay-runner"].attributes;
      next = {
        saveSchemaVersion: 1,
        id: randomUUID(), agentId: id.agentId, sessionId: id.sessionId,
        sessionKey: id.sessionKey, destination: target, owner: id.actor,
        ...(authority.starterSession ? { starterSession: authority.starterSession } : {}),
        approved: { [id.actor]: true }, players: { [id.actor]: "quay" }, attributes: { [id.actor]: attributes },
        resolve: { [id.actor]: 6 }, rests: { [id.actor]: { before: false, after: false } },
        inventory: { [id.actor]: [] }, world: initialWorld(), receipts: {}, version: 1,
      };
      text = `Created game ${next.id} with ${cmd.target ?? "quay-runner"}. ${describe(next, id.actor)}`;
    } else {
      if (!current) return denied;
      if (current.world.ending !== "none") return "This game has a committed ending; start a new session for a new game.";
      if (cmd.verb === "approve") {
        if (current.owner !== id.actor || (cmd.gameId && cmd.gameId !== current.id)) return denied;
        const approvedActor = authority.approvedActor?.(cmd.sender!) ?? JSON.stringify([id.channel, id.accountId, cmd.sender]);
        if (!Object.hasOwn(current.approved, approvedActor) && Object.keys(current.approved).length >= MAX_PLAYERS) return "Game is full.";
        next = { ...current, approved: { ...current.approved, [approvedActor]: true }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Approved sender for game ${next.id}.`;
      } else if (cmd.verb === "join") {
        if (cmd.gameId !== current.id) return denied;
        if (!Object.hasOwn(current.approved, id.actor)) return denied;
        if (!Object.hasOwn(current.players, id.actor) && Object.keys(current.players).length >= MAX_PLAYERS) return "Game is full.";
        next = { ...current, players: { ...current.players, [id.actor]: current.players[id.actor] ?? "quay" },
          attributes: { ...current.attributes, [id.actor]: current.attributes[id.actor] ?? { grit: 1, wits: 2, charm: 0 } },
          resolve: { ...current.resolve, [id.actor]: current.resolve[id.actor] ?? 6 },
          rests: { ...current.rests, [id.actor]: current.rests[id.actor] ?? { before: false, after: false } },
          inventory: { ...current.inventory, [id.actor]: current.inventory[id.actor] ?? [] }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Joined game ${next.id}. ${describe(next, id.actor)}`;
      } else if (cmd.verb === "move") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        if (current.players[id.actor] !== cmd.direction && !canMove(current.world, current.players[id.actor], cmd.direction!)) return "That exit is blocked or not connected.";
        const alreadyThere = current.players[id.actor] === cmd.direction;
        next = { ...current, players: { ...current.players, [id.actor]: cmd.direction! }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `${alreadyThere ? "Already there." : "Moved."} ${describe(next, id.actor)}`;
      } else if (cmd.verb === "examine") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const at = current.players[id.actor];
        const found = examine(current.world, at, cmd.target!);
        if (!found) return "Nothing relevant is visible here.";
        const flags = { ...current.world.flags };
        const clues = { ...current.world.clues };
        if (at === "quay" && cmd.target === "cleat") flags.lineFound = true;
        if (at === "tavern" && cmd.target === "survey-plate") { clues.plateRead = true; clues.balanceKnown = true; clues.stakesKnown = true; }
        if (at === "market" && cmd.target === "gauge-slate") { clues.marketPatternHeard = true; clues.balanceKnown = true; }
        if (at === "pump" && cmd.target === "pressure-diagram") clues.balanceKnown = true;
        if (at === "archive" && cmd.target === "harbor-plan") { clues.archivePlanRead = true; clues.balanceKnown = true; clues.stakesKnown = true; }
        const journal = [...current.world.journal, `An object was examined in ${at}.`];
        next = { ...current, world: { ...current.world, flags, clues, journal }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `${found} Version ${next.version}.`;
      } else if (cmd.verb === "talk") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const at = current.players[id.actor];
        const conversation = talk(current.world, at, cmd.target!);
        if (!conversation) return "That NPC is not here.";
        const clues = { ...current.world.clues, [conversation.clue]: true, balanceKnown: true };
        const flags = cmd.target === "suri" ? { ...current.world.flags, suriOfferedHelp: true } : current.world.flags;
        next = { ...current, world: { ...current.world, flags, clues, journal: [...current.world.journal, `${cmd.target} shared an operating clue in ${at}.`] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `${conversation.text} Version ${next.version}.`;
      } else if (cmd.verb === "take") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const item = cmd.target as ItemId;
        if (current.world.items[item] !== current.players[id.actor]) return "That item is not available here.";
        if (item === "safety-line" && !current.world.flags.lineFound) return "That item has not been discovered.";
        next = { ...current, world: { ...current.world, items: { ...current.world.items, [item]: id.actor }, journal: [...current.world.journal, `An item was collected in ${current.players[id.actor]}.`] },
          inventory: { ...current.inventory, [id.actor]: [...(current.inventory[id.actor] ?? []), item] }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Collected ${item}. Version ${next.version}.`;
      } else if (cmd.verb === "roll") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const result = roll(cmd.target as Attribute, current.attributes[id.actor], die);
        next = { ...current, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Rolled ${result.dice.join("+")} + ${result.modifier} ${result.attribute} = ${result.total}: ${result.band}. Version ${next.version}. No consequence committed.`;
        next.receipts[rkey] = { fingerprint: fingerprint(cmd), text, roll: result };
      } else if (cmd.verb === "risk") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const [hazard, choice, retreatRoom, leaveItem] = cmd.target!.split(":");
        const pump = hazard === "pump-hatch";
        const stair = hazard === "tower-stair";
        if (pump) {
          if (current.players[id.actor] !== "pump") return "The Pump hatch is not here.";
          if (current.world.flags.pressureRelieved) return "The pressure at the Pump House has already been relieved.";
          if (current.world.flags.pumpBraced) return "The lever is already braced; open the hatch without a roll.";
        } else if (stair) {
          if (current.players[id.actor] !== "tower") return "The Tower service stair is not here.";
          if (current.world.flags.stairOpen) return "The Tower service stair is already open.";
        } else {
          if (current.players[id.actor] !== "archive") return "The shelf hazard is not here.";
          if (current.world.flags.archiveShelfSettled) return "The shelf hazard is already settled.";
          if (leaveItem && current.world.items[leaveItem as ItemId] !== id.actor) return "Carry the chosen item before risking the shelf.";
        }
        // Keep dice across internal CAS retries. Recompute costs against the fresh row.
        const result = riskRoll ??= roll(pump || stair ? "grit" : choice as Attribute, current.attributes[id.actor], die);
        const complication = result.band === "complication";
        const mixed = result.band === "cost";
        const surgeCost = complication || ((pump || stair) && mixed && choice === "surge");
        const atCap = current.world.surge === 2;
        const costsResolve = (mixed && !surgeCost && !leaveItem) || ((pump || stair) && surgeCost && atCap);
        const surge = surgeCost && !atCap ? current.world.surge + 1 : current.world.surge;
        const strain = applyResolve(current.resolve[id.actor], costsResolve ? 1 : 0);
        let consequence: string;
        if (pump || stair) {
          const opening = stair ? complication ? "The Tower service stair opens loudly." : mixed ? "The Tower service stair opens." : "The Tower service stair opens silently."
            : current.world.flags.pumpOpen ? complication ? "The release wheel jams open." : "The release wheel turns."
            : complication ? "The Pump hatch opens noisily and the wheel jams open."
            : mixed ? "The Pump hatch opens." : "The Pump hatch opens cleanly.";
          const cost = costsResolve ? " The effort costs 1 Resolve." : surgeCost ? " The surge rises." : "";
          consequence = opening + (pump ? " The trapped pressure drains." : "") + cost;
        } else {
          consequence = mixed ? leaveItem ? `The satchel is saved, but ${leaveItem} is left on the Archive shelf.` : "The satchel is saved, but the effort costs 1 Resolve."
            : !complication ? "The satchel is saved cleanly." : atCap
              ? "Water takes the satchel, exposing a maintenance route; supplies are soaked at high surge."
              : "Water takes the satchel, exposing a maintenance route; the surge rises.";
        }
        const settled = pump ? "pumpOpen" : stair ? "stairOpen" : "archiveShelfSettled";
        const entry = pump || stair ? consequence : `The Archive shelf was settled. ${consequence}`;
        const leave = !pump && mixed && leaveItem;
        next = { ...current, resolve: { ...current.resolve, [id.actor]: strain.resolve },
          players: strain.retreat ? { ...current.players, [id.actor]: retreatRoom as RoomId } : { ...current.players },
          inventory: leave ? { ...current.inventory, [id.actor]: current.inventory[id.actor].filter((item) => item !== leaveItem) } : current.inventory,
          world: { ...current.world, surge, items: leave ? { ...current.world.items, [leaveItem as ItemId]: "archive" } : current.world.items, flags: { ...current.world.flags, [settled]: true, ...(pump ? { pressureRelieved: true } : {}) },
            journal: [...current.world.journal, entry] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Rolled ${result.dice.join("+")} + ${result.modifier} ${result.attribute} = ${result.total}: ${result.band}. ${consequence}${strain.retreat ? ` Retreat to ${retreatRoom === "quay" ? "Lantern Quay" : "the Crooked Compass"}; a breather can restore Resolve.` : ""} Version ${next.version}.`;
        next.receipts[rkey] = { fingerprint: fingerprint(cmd), text, roll: result };
      } else if (cmd.verb === "rest") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        if (current.players[id.actor] !== "tavern" && current.resolve[id.actor] !== 0) return "Rest at the Crooked Compass.";
        if (current.resolve[id.actor] === 6) return "Resolve is already full.";
        const afterDiscovery = current.world.clues.stakesKnown;
        const period = afterDiscovery ? "after" : "before";
        if (current.resolve[id.actor] !== 0 && current.rests[id.actor][period]) return "That Tavern rest has already been used.";
        const restored = Math.min(6, current.resolve[id.actor] + 2);
        next = { ...current, resolve: { ...current.resolve, [id.actor]: restored },
          rests: { ...current.rests, [id.actor]: current.resolve[id.actor] === 0 ? { ...current.rests[id.actor] } : { ...current.rests[id.actor], [period]: true } },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Recovered to ${restored} Resolve. Version ${next.version}.`;
      } else if (cmd.verb === "finish") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const at = current.players[id.actor];
        if (!current.world.clues.stakesKnown) return "Learn the consequences from Mara, the survey plate, or the Archive plan before choosing an ending.";
        if (cmd.target !== "deferred" && at !== "tower") return "Operate the ending controls from Beacon Tower.";
        if (["balanced", "diverted"].includes(cmd.target!) && current.world.reflector === "none") return "Fit a reflector at Beacon Tower before lighting the beacon.";
        if (cmd.target === "balanced" && !current.world.flags.pressureRelieved) return "The pressure gauge is still in the red. At the Pump House, hold the lever and turn the release wheel to make BALANCE safe. Suri can help.";
        if (cmd.target === "shuttered" && !current.world.flags.boatsWarned) return "Warn the boats before shutting the beacon.";
        if (cmd.target === "deferred" && !current.world.flags.evacuated) return "Organize warning and evacuation before deferring repairs.";
        // Mara can help fit an improvised reflector: neither the prism nor mirror is a required quest key.
        const dial = cmd.target === "balanced" ? "balanced" : cmd.target === "diverted" ? "diverted" : cmd.target === "shuttered" ? "shut" : "unset";
        const beacon = cmd.target === "balanced" || cmd.target === "diverted" ? "lit" : "dark";
        const consequence = cmd.target === "diverted"
          ? current.world.flags.marketWarned ? "The Market run floods, but the warning protected its goods." : "One Market stall lost stock in the diverted water."
          : cmd.target === "balanced" ? "Both shores are safe; a fitted or improvised reflector lights the beacon."
          : cmd.target === "shuttered" ? "The warned boats take shelter while the Market remains dry."
          : "Residents have been warned and evacuated; repairs wait until dawn.";
        next = { ...current, world: { ...current.world, ending: cmd.target as WorldState["ending"], dial, beacon,
          journal: [...current.world.journal, `The party chose the ${cmd.target} ending. ${consequence}`] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Committed ${cmd.target} ending. ${consequence} Version ${next.version}.`;
      } else if (cmd.verb === "warn") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const flag = cmd.target === "boats" ? "boatsWarned" : cmd.target === "market" ? "marketWarned" : "evacuated";
        if (cmd.target === "boats" && !["quay", "tower", "tavern", "market"].includes(current.players[id.actor])) return "The boats cannot hear you from here.";
        if (cmd.target === "market" && current.players[id.actor] !== "market") return "Warn the Market from Tide Market.";
        if (cmd.target === "evacuate" && !["quay", "market", "tavern"].includes(current.players[id.actor])) return "Organize evacuation from town.";
        if (current.world.flags[flag]) return "That warning is already complete.";
        next = { ...current, world: { ...current.world, flags: { ...current.world.flags, [flag]: true },
          journal: [...current.world.journal, `The ${cmd.target} warning was completed.`] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Committed ${cmd.target} warning. Version ${next.version}.`;
      } else if (cmd.verb === "brace") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        if (current.players[id.actor] !== "pump") return "The pump lever is not here.";
        if (current.world.flags.pressureRelieved) return "The pressure at the Pump House has already been relieved.";
        if (current.world.flags.pumpBraced) return "The pump lever is already braced.";
        const braceItem = cmd.target === "pump-lever:safety-line" ? "safety-line" : "weather-crate";
        if (current.world.items[braceItem] !== id.actor) return `Carry the ${braceItem} before bracing the lever.`;
        next = { ...current, world: { ...current.world, flags: { ...current.world.flags, pumpBraced: true },
          journal: [...current.world.journal, `The pump lever was secured with the ${braceItem}.`] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Braced the pump lever with the ${braceItem}. Version ${next.version}.`;
      } else if (cmd.verb === "fit") {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        if (current.players[id.actor] !== "tower") return "Fit the reflector at Beacon Tower.";
        if (current.world.reflector !== "none") return "The lens already has a reflector.";
        if (cmd.target !== "improvised" && current.world.items[cmd.target as ItemId] !== id.actor) return "You do not carry that reflector.";
        if (cmd.target === "improvised" && !current.world.clues.stakesKnown) return "Ask Mara about the controls before improvising a reflector.";
        next = { ...current, world: { ...current.world, reflector: cmd.target as WorldState["reflector"], journal: [...current.world.journal, "A reflector was fitted at Beacon Tower."] }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Fitted ${cmd.target} at Beacon Tower. Version ${next.version}.`;
      } else {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const at = current.players[id.actor];
        const assisted = cmd.target === "pump-hatch:suri";
        const pump = assisted || cmd.target === "pump-hatch";
        if (at !== (pump ? "pump" : "tower") && (at !== "archive" || assisted)) return "That mechanism is not here.";
        const release = pump && at === "pump";
        if (pump && (release ? current.world.flags.pressureRelieved : current.world.flags.pumpOpen))
          return release ? "The pressure at the Pump House has already been relieved." : "The Pump hatch is already open.";
        if (assisted && !current.world.flags.suriOfferedHelp) return "Talk to Suri at Tide Market before asking her to hold the lever.";
        if (release && !assisted && !current.world.flags.pumpBraced)
          return "The lever must be held or braced before the wheel can release the pressure. Ask Suri, use the weather crate, or risk a solo release.";
        const flags = { ...current.world.flags, [pump ? "pumpOpen" : "stairOpen"]: true, ...(release ? { pressureRelieved: true } : {}) };
        const routeOpened = !release || !current.world.flags.pumpOpen;
        const entry = [
          assisted ? "Suri held the lever." : "",
          routeOpened ? "A route to the Archive was opened." : "",
          release ? "The trapped pressure drained at the Pump House." : "",
        ].filter(Boolean).join(" ");
        next = { ...current, world: { ...current.world, flags, journal: [...current.world.journal, entry] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        const opening = release && current.world.flags.pumpOpen ? "" : `Opened ${pump ? "pump-hatch" : "tower-stair"}. `;
        text = `${assisted ? "Suri holds the lever. " : ""}${opening}${release ? "The trapped pressure drains. " : ""}Version ${next.version}.`;
      }
    }
    // Prevent unbounded retained rows: reject before a receipt can be silently evicted.
    if (Object.keys(next.receipts).length > MAX_RECEIPTS) return "Receipt capacity reached; game requires maintenance.";
    next.receipts[rkey] ??= { fingerprint: fingerprint(cmd), text };
    if (Object.keys(next.receipts).length > MAX_RECEIPTS) return "Receipt capacity reached; game requires maintenance.";
    if (Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_GAME_BYTES) return "Game capacity reached; game requires maintenance.";
    authority.assertCurrent();
    if (await authority.destination() !== target) return denied;
    authority.assertCurrent();
    const result = await store.compareAndApply(key, observed.comparison, { operation: "update", action: "set", value: next });
    authority.assertCurrent();
    if (result.status === "applied") {
      if (await authority.destination() !== target) return denied;
      authority.assertCurrent();
      return text;
    }
    if (result.status !== "conflict") return denied;
  }
  return "Campaign Keeper: concurrent update; retry with the same request id.";
}

/** Optional host capability proposed by OpenClaw #189600; older hosts fail closed for WebChat. */
type PlayerToolContext = OpenClawPluginToolContext<2> & {
  requesterProfile?: { readonly id: string; assertCurrent: () => void };
};

function launchDestination(keeper: LaunchSession): string {
  return JSON.stringify(["launcher", keeper.agentId, keeper.sessionKey, keeper.sessionId, keeper.lifecycleRevision ?? null]);
}

function launchIdentity(route: LaunchRoute): Identity {
  return { ...route.keeper, channel: "launcher", accountId: "launcher",
    actor: JSON.stringify(["human-profile", route.profileId]) };
}

const launchRequestId = "launcher-start";
function launchedArchetype(game: Game): Archetype | undefined {
  const saved = game.receipts[receiptKey(game.owner, launchRequestId)]?.fingerprint;
  if (saved === fingerprint({ verb: "create" })) return "quay-runner";
  return archetypeIds.find(target => saved === fingerprint({ verb: "create", target }));
}

export async function launchedScene(route: LaunchRoute, store: Store, selection?: Archetype) {
  const id = launchIdentity(route);
  const target = launchDestination(route.keeper);
  if (selection) {
    await runTransition(id, target, { verb: "create", requestId: launchRequestId, target: selection }, store, {
      assertCurrent: route.assertCurrent, destination: async () => target, starterSession: route.player,
    });
  }
  const game = await launchedSave(route.keeper, store, route.assertCurrent);
  if (!game || game.owner !== id.actor || !sameLaunchSession(game.starterSession, route.player)) return null;
  const archetype = launchedArchetype(game);
  if (!archetype || (selection && selection !== archetype)) return null;
  return { room: rooms[game.players[id.actor]].name, scene: viewRoom(game.world, game.players[id.actor], id.actor),
    character: archetypes[archetype].name };
}

async function launchedSave(keeper: LaunchSession, store: Store, assertCurrent: () => void) {
  if (!store.observe) return null;
  const target = launchDestination(keeper);
  const key = JSON.stringify([keeper.agentId, keeper.sessionId, target]);
  assertCurrent();
  const { value } = await store.observe(key);
  assertCurrent();
  return value && bound(value, keeper, target) && validGame(value, key) ? value : null;
}

export async function launchedManagement(keeper: LaunchSession, store: Store, assertCurrent: () => void) {
  const game = await launchedSave(keeper, store, assertCurrent);
  return game ? { version: game.version, players: Object.keys(game.players).length,
    room: rooms[game.players[game.owner]].name } : null;
}
function directPlayerInput(ctx: PlayerToolContext): boolean {
  const p = ctx.inputProvenance;
  return !p || (p.kind === "external_user" && !p.sourceSessionKey && !p.sourceTool && !p.sourceRole);
}
function playerCurrentAssertion(ctx: PlayerToolContext): () => void {
  // Agent traffic keeps agent identity even if a sponsoring profile is present.
  const profile = directPlayerInput(ctx) && ctx.messageChannel === "webchat" ? ctx.requesterProfile : undefined;
  return () => {
    ctx.assertInvocationCurrent();
    if (directPlayerInput(ctx) && ctx.messageChannel === "webchat") {
      if (!profile?.id?.trim() || typeof profile.assertCurrent !== "function") throw Error("verified requester unavailable");
      profile.assertCurrent();
    }
  };
}

type PrivateSolo = { agentId?: string; toolName?: string; assertOperatorCurrent: () => void };

function privateSoloAssertion(ctx: PlayerToolContext, solo: PrivateSolo): () => void {
  const inInvocation = AsyncLocalStorage.snapshot();
  return () => inInvocation(() => {
    if (!ctx.agentId || (solo.agentId && ctx.agentId !== solo.agentId) || !ctx.sessionId?.trim() ||
        !ctx.sessionKey?.startsWith(`agent:${ctx.agentId}:`) || isIncognitoSessionKey(ctx.sessionKey) ||
        (!solo.agentId && !ctx.runId?.trim()) || ("backgroundRun" in ctx && ctx.backgroundRun) ||
        ctx.messageChannel !== "webchat" || ctx.senderIsOwner !== true || !directPlayerInput(ctx)) {
      throw Error("Private solo chat is unavailable");
    }
    ctx.assertInvocationCurrent();
    solo.assertOperatorCurrent();
  });
}

/** Session tool adapter: actor is derived exclusively from host context, never model arguments. */
export async function runPlayerIntent(ctx: PlayerToolContext, args: unknown, store: Store, launch?: LaunchRoute,
  assertSoloCurrent?: () => void): Promise<string> {
  if (!ctx.agentId?.trim() || !ctx.sessionKey?.trim() || !ctx.sessionId?.trim() || !ctx.assertInvocationCurrent ||
      !store.observe || !store.compareAndApply || !args || typeof args !== "object" || Array.isArray(args)) return denied;
  const input = args as Record<string, unknown>;
  if (Object.keys(input).some(key => !["action", "requestId", "target", "gameId", "sourceSessionKey", "choice", "retreat", "item", "helper"].includes(key)) ||
      typeof input.action !== "string" || typeof input.requestId !== "string" || !token.test(input.requestId)) return denied;
  const provenance = ctx.inputProvenance;
  let actor: string;
  const isLauncherChat = !assertSoloCurrent && ctx.sessionKey.startsWith(`agent:${ctx.agentId}:dashboard:ck-play-`);
  const directHuman = Boolean(assertSoloCurrent) || (directPlayerInput(ctx) && (ctx.senderIsOwner === true || isLauncherChat) &&
    (ctx.messageChannel === "webchat"
      ? Boolean(ctx.requesterProfile?.id?.trim() && typeof ctx.requesterProfile.assertCurrent === "function")
      : Boolean(ctx.requesterSenderId?.trim())));
  if (assertSoloCurrent) {
    if (input.gameId !== undefined || input.sourceSessionKey !== undefined ||
        ["approve", "enroll", "join"].includes(input.action)) return denied;
    if (input.action === "create" && !isArchetype(input.target)) return denied;
    actor = "solo-player";
  } else if (provenance?.kind === "inter_session" && provenance.sourceTool === "sessions_send" &&
      provenance.sourceSessionKey?.trim() && /^agent:[^:]+:.+/.test(provenance.sourceSessionKey) &&
      provenance.sourceSessionKey.length <= 256 && !/\s/.test(provenance.sourceSessionKey) && provenance.sourceSessionKey !== ctx.sessionKey) {
    actor = JSON.stringify(["agent-session", provenance.sourceSessionKey]);
  } else if (directHuman) {
    if (!ctx.messageChannel?.trim()) return denied;
    actor = ctx.messageChannel === "webchat"
      ? JSON.stringify(["human-profile", ctx.requesterProfile!.id])
      : JSON.stringify(["human", ctx.messageChannel, ctx.agentAccountId ?? "", ctx.requesterSenderId]);
  } else return denied;
  if (["create", "enroll"].includes(input.action) && !directHuman) return denied;
  for (const key of ["choice", "retreat", "item", "helper"]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || !token.test(input[key] as string))) return denied;
  }
  if (input.action !== "risk" && ["choice", "retreat", "item"].some(key => input[key] !== undefined)) return denied;
  if (!["open", "brace"].includes(input.action) && input.helper !== undefined) return denied;
  let cmd: Command | null;
  if (input.action === "enroll") {
    if (typeof input.sourceSessionKey !== "string" || !/^agent:[^:]+:.+/.test(input.sourceSessionKey) ||
        input.sourceSessionKey.length > 256 || /\s/.test(input.sourceSessionKey) || input.sourceSessionKey === ctx.sessionKey ||
        input.target !== undefined || typeof input.gameId !== "string" || !/^[0-9a-f-]{36}$/.test(input.gameId)) return denied;
    cmd = { verb: "approve", sender: input.sourceSessionKey, gameId: input.gameId, requestId: input.requestId };
  } else {
    if (input.sourceSessionKey !== undefined || input.action === "approve") return denied;
    const target = input.action === "join" ? input.gameId : input.target;
    if (target !== undefined && (typeof target !== "string" || (input.action !== "move" && /\s/.test(target)))) return denied;
    if (input.action === "join" && input.target !== undefined || input.action === "create" && input.gameId !== undefined ||
        input.gameId !== undefined && (typeof input.gameId !== "string" || !/^[0-9a-f-]{36}$/.test(input.gameId))) return denied;
    if (input.action === "risk") {
      if (!input.choice || !input.retreat) return denied;
      cmd = parse(["risk", target, input.choice, input.item, input.retreat, input.requestId].filter(v => v !== undefined).join(" "));
    } else if (input.helper !== undefined) {
      cmd = parse([input.action, target, input.helper, input.requestId].join(" "));
    } else if (["look", "inventory", "recap"].includes(input.action)) {
      if (target !== undefined) return denied;
      cmd = parse(input.action);
    } else {
      const room = input.action === "move" && typeof target === "string"
        ? Object.entries(rooms).find(([id, room]) => id === target || room.name === target)?.[0]
        : target;
      cmd = parse([input.action, room, input.requestId].filter(v => v !== undefined).join(" "));
    }
    if (!cmd) return denied;
    if (input.gameId !== undefined) cmd.gameId = input.gameId as string;
  }
  if (isLauncherChat) {
    if (!launch || !directHuman || ctx.messageChannel !== "webchat" || launch.profileId !== ctx.requesterProfile?.id ||
        ctx.sessionKey !== launch.player.sessionKey || ctx.sessionId !== launch.player.sessionId ||
        ["create", "approve", "join"].includes(cmd.verb)) return denied;
    const target = launchDestination(launch.keeper);
    const assertCurrent = playerCurrentAssertion(ctx);
    return runTransition(launchIdentity(launch), target, cmd, store, {
      assertCurrent: () => { assertCurrent(); launch.assertCurrent(); },
      destination: async () => target, starterSession: launch.player,
    });
  }
  const channel = assertSoloCurrent ? "private-solo-chat" : "session-tool";
  const id: Identity = { agentId: ctx.agentId, sessionKey: ctx.sessionKey, sessionId: ctx.sessionId,
    channel, accountId: channel, actor };
  const target = JSON.stringify([channel, id.agentId, id.sessionKey, id.sessionId]);
  const assertCurrent = assertSoloCurrent ?? playerCurrentAssertion(ctx);
  assertCurrent();
  return runTransition(id, target, cmd, store, {
    assertCurrent,
    destination: async () => target,
    approvedActor: key => JSON.stringify(["agent-session", key]),
  });
}

export function registerPlayerIntentTool(api: Pick<OpenClawPluginApi, "registerTool" | "runtime">,
  resolveLaunch?: (ctx: PlayerToolContext) => Promise<LaunchRoute | undefined>, solo?: PrivateSolo): void {
  const name = solo?.toolName ?? "campaign_keeper_intent";
  api.registerTool({ contextVersion: 2, create(ctx) {
    return {
      name, label: "Campaign Keeper player intent",
      description: solo
        ? "Apply an action for the sole player in this private Keeper chat. Choose a class before creating a save. Reads and moves use the current chat automatically."
        : "Translate the current player's natural-language request into a supported action, then narrate only its committed result. Identity comes from host context. Owner-only enroll approves an exact agent source session; the agent must join. No actor override. Unsupported proposals require clarification, not invented effects.",
      parameters: { type: "object", additionalProperties: false, required: ["action", "requestId"],
        properties: { action: { type: "string" }, requestId: { type: "string" }, target: { type: "string" },
          ...(!solo ? { gameId: { type: "string" }, sourceSessionKey: { type: "string" } } : {}),
          choice: { type: "string" }, retreat: { type: "string" }, item: { type: "string" }, helper: { type: "string" } } } as any,
      async execute(_callId, args) {
        try {
          const launch = await resolveLaunch?.(ctx);
          const assertPlayer = solo ? privateSoloAssertion(ctx, solo) : playerCurrentAssertion(ctx);
          const store = openGameStore(api.runtime, () => { assertPlayer(); launch?.assertCurrent(); });
          const text = await runPlayerIntent(ctx, args, store, launch, solo ? assertPlayer : undefined);
          return { content: [{ type: "text" as const, text }], ...(text === denied ? { details: { rejection: "adapter-validation", context: {
            agent: Boolean(ctx.agentId), session: Boolean(ctx.sessionKey), incarnation: Boolean(ctx.sessionId),
            owner: ctx.senderIsOwner === true, requester: Boolean(ctx.requesterSenderId), channel: ctx.messageChannel ?? null,
            provenance: ctx.inputProvenance?.kind ?? null, sourceTool: ctx.inputProvenance?.sourceTool ?? null,
          } } } : {}) };
        } catch { return { content: [{ type: "text" as const, text: denied }], details: {
          rejection: "authority-or-storage",
        } }; }
      },
    };
  } }, { name, optional: Boolean(solo && !solo.agentId) });
}

const storeOptions = { namespace: "campaign-keeper-spike-v2", maxEntries: 64, overflowPolicy: "reject-new" } as const;
export function openGameStore(runtime: OpenClawPluginApi["runtime"], assertCurrent: () => void): Store {
  return runtime.state.openKeyedStoreV2<Game>(storeOptions, { assertCurrent });
}

/** This projection never includes binding, owner, sender IDs, positions or receipts. */
export async function readGameStats(
  ctx: PluginSessionActionContext, store: Pick<Store, "entries">, configuredAgent: string,
): Promise<{ totalGames: number; activeGames: number; completedGames: number; acceptedActions: number;
  games: { gameId: string; label: string; playerCount: number; acceptedActions: number }[];
  asOfVersion: number; status: "complete" } | null> {
  const client = ctx.client;
  const permitted = () => Boolean(client?.assertCurrent && client?.allowsAgent && client?.isSharedGateway &&
    client.scopes?.some((scope) => ["operator.read", "operator.write", "operator.admin"].includes(scope)) &&
    client.allowsAgent(configuredAgent) &&
    (!client.isSharedGateway() || client.scopes.includes("operator.admin")));
  // The host resolves the session's agent. Never accept an agent ID in a payload as authority.
  if (!configuredAgent || ctx.agentId !== configuredAgent || !ctx.sessionKey || !permitted()) return null;
  client?.assertCurrent?.();
  const rows = await store.entries();
  client?.assertCurrent?.();
  if (rows.length > storeOptions.maxEntries || !permitted()) return null;
  const games: { gameId: string; label: string; playerCount: number; acceptedActions: number }[] = [];
  let completedGames = 0;
  const ids = new Set<string>();
  for (const { key, value: game } of rows) {
    // A legacy/malformed row makes the entire aggregate unavailable rather than falsely low.
    if (!game || typeof game !== "object" || typeof game.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(game.id) || ids.has(game.id) ||
        game.agentId !== configuredAgent || typeof game.sessionId !== "string" || !game.sessionId ||
        typeof game.sessionKey !== "string" || !game.sessionKey ||
        typeof game.destination !== "string" || !game.destination ||
        key !== JSON.stringify([game.agentId, game.sessionId, game.destination]) ||
        !Number.isSafeInteger(game.version) || game.version < 1 ||
        !game.receipts || typeof game.receipts !== "object" || Array.isArray(game.receipts) ||
        Object.keys(game.receipts).length !== game.version || game.version > MAX_RECEIPTS ||
        !game.players || typeof game.players !== "object" || Array.isArray(game.players) ||
        Object.keys(game.players).length < 1 || Object.keys(game.players).length > MAX_PLAYERS ||
        !validGame(game, key) || !permitted()) return null;
    ids.add(game.id);
    if (game.world.ending !== "none") completedGames++;
    games.push({ gameId: game.id, label: `Game ${games.length + 1}`, playerCount: Object.keys(game.players).length,
      acceptedActions: game.version });
  }
  client?.assertCurrent?.();
  if (!permitted()) return null;
  const asOfVersion = games.reduce((sum, game) => sum + game.acceptedActions, 0);
  if (!Number.isSafeInteger(asOfVersion)) return null;
  return { totalGames: games.length, activeGames: games.length - completedGames, completedGames,
    acceptedActions: asOfVersion, games, asOfVersion, status: "complete" };
}

export function registerEngine(api: Pick<OpenClawPluginApi, "registerCommand" | "runtime" | "session" | "pluginConfig"> & Partial<Pick<OpenClawPluginApi, "registerTool">>,
  resolveLaunch?: (ctx: PlayerToolContext) => Promise<LaunchRoute | undefined>): void {
  if (api.registerTool) registerPlayerIntentTool(api as Pick<OpenClawPluginApi, "registerTool" | "runtime">, resolveLaunch);
  // Explicit opt-in and an exact configured agent; the descriptor and action share this gate.
  if (api.pluginConfig?.dashboardEnabled === true && typeof api.pluginConfig.agentId === "string" && api.pluginConfig.agentId.trim()) {
    const agentId = api.pluginConfig.agentId;
    api.session.controls.registerControlUiDescriptor({
      surface: "widget", id: "game-stats", label: "Campaign Keeper statistics",
      requiredScopes: ["operator.read"],
    });
    api.session.controls.registerSessionAction({
      id: "gameStats", description: "Read bounded Campaign Keeper game statistics", requiredScopes: ["operator.read"],
      schema: { type: "object", additionalProperties: false, properties: {} },
      handler: async (ctx) => {
        try {
          const store = api.runtime.state.openKeyedStoreV2<Game>(storeOptions, {
            assertCurrent: () => ctx.client?.assertCurrent?.(),
          });
          const result = await readGameStats(ctx, store, agentId);
          return result ? { result } : { ok: false, error: "Game statistics unavailable.", code: "UNAVAILABLE" };
        } catch {
          return { ok: false, error: "Game statistics unavailable.", code: "UNAVAILABLE" };
        }
      },
    });
  }
  api.registerCommand({
    name: "ck", description: "Campaign Keeper capability spike", acceptsArgs: true, requireAuth: true,
    requiredScopes: ["operator.write"],
    handler: async (ctx) => {
      // Each invocation uses host-provided authority; no cached writable store or ambient identity.
      const actor = identity(ctx);
      if (!actor) return { text: denied };
      try {
        const store = api.runtime.state.openKeyedStoreV2<Game>(
          storeOptions,
          { assertCurrent: ctx.assertOwnerCurrent! },
        );
        if (ctx.args?.trim() === "scene") {
          const prompt = await scenePrompt(ctx, store);
          return prompt ? { continueAgent: { prompt } } : { text: denied };
        }
        return { text: await runCommand(ctx, store) };
      } catch {
        // No state, internals or binding details leaked when storage or authority fails.
        return { text: denied };
      }
    },
  });
}
