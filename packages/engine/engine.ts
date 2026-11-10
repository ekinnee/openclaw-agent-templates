// Narrow deterministic command owner. No model, filesystem writes, or player-facing GM material.
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { PluginCommandContext, OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import type { PluginSessionActionContext } from "openclaw/plugin-sdk/plugin-entry";
import { canMove, examine, initialWorld, itemId, roomId, viewRoom, type ItemId, type RoomId, type WorldState } from "./world.js";
import { roll, validAttributes, type Attribute, type Attributes, type Roll } from "./rules.js";

type Store = PluginStateKeyedStore<Game, 2>;
type Position = RoomId;
type Receipt = { fingerprint: string; text: string; roll?: Roll };
type Game = {
  id: string;
  agentId: string;
  sessionId: string;
  sessionKey: string;
  destination: string;
  owner: string;
  approved: Record<string, true>;
  players: Record<string, Position>;
  attributes: Record<string, Attributes>;
  resolve: Record<string, number>;
  inventory: Record<string, ItemId[]>;
  world: WorldState;
  receipts: Record<string, Receipt>;
  version: number;
};
type Command = { verb: "create" | "approve" | "join" | "look" | "move" | "take" | "inventory" | "examine" | "open" | "recap" | "roll"; requestId?: string; direction?: Position; gameId?: string; sender?: string; target?: string };

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
  if (words[0] === "create" && words.length === 2 && token.test(words[1])) return { verb: "create", requestId: words[1] };
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
  if (words[0] === "roll" && words.length === 3 && ["grit", "wits", "charm"].includes(words[1]) && token.test(words[2]))
    return { verb: "roll", target: words[1], requestId: words[2] };
  return null;
}

function identity(ctx: PluginCommandContext) {
  // No public callback revalidates ordinary non-owner authorization after an await.
  // Until the SDK supplies one, even approved players cannot execute commands.
  if (!ctx.isAuthorizedSender || !ctx.senderIsOwner || !ctx.assertOwnerCurrent ||
      !ctx.senderId?.trim() || ctx.senderId.length > 256 || !ctx.agentId?.trim() ||
      !ctx.sessionKey?.trim() || !ctx.sessionId?.trim() || !ctx.channel?.trim() || !ctx.accountId?.trim()) return null;
  return {
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
    channel: ctx.channel,
    accountId: ctx.accountId,
    actor: JSON.stringify([ctx.channel, ctx.accountId, ctx.senderId]),
  };
}
type Identity = NonNullable<ReturnType<typeof identity>>;
function destination(ctx: PluginCommandContext, id: Identity, binding: Awaited<ReturnType<PluginCommandContext["getCurrentConversationBinding"]>>): string | null {
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
function bound(game: Game, id: Identity, target: string): boolean {
  return game.agentId === id.agentId && game.sessionId === id.sessionId &&
    game.sessionKey === id.sessionKey && game.destination === target;
}
function describe(game: Game, actor: string): string {
  return `${viewRoom(game.world, game.players[actor], actor)} Game ${game.id}; version ${game.version}.`;
}
function receiptKey(actor: string, requestId: string): string { return JSON.stringify([actor, requestId]); }
function fingerprint(cmd: Command): string { return JSON.stringify([cmd.verb, cmd.gameId ?? null, cmd.direction ?? null, cmd.sender ?? null, cmd.target ?? null]); }
const help = "Usage: /ck create <id> | approve <sender> <id> | join <game> <id> | look | move <room> <id> | take <item> <id> | examine <object> <id> | inventory | recap | open <pump-hatch|tower-stair> <id> | roll <grit|wits|charm> <id>";
const denied = "Campaign Keeper: unavailable or not authorized for this conversation.";
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validGame(game: Game, key: string): boolean {
  if (!record(game) || !record(game.players) || !record(game.approved) || !record(game.receipts) ||
      !record(game.inventory) || !record(game.attributes) || !record(game.resolve) || !record(game.world) || !record(game.world.items) || !record(game.world.flags) ||
      !Array.isArray(game.world.journal) || game.world.journal.length > MAX_RECEIPTS ||
      !game.world.journal.every((entry) => typeof entry === "string" && entry.length <= 256) ||
      typeof game.id !== "string" || !/^[0-9a-f-]{36}$/.test(game.id) ||
      typeof game.agentId !== "string" || typeof game.sessionId !== "string" || typeof game.destination !== "string" ||
      key !== JSON.stringify([game.agentId, game.sessionId, game.destination]) ||
      !Number.isSafeInteger(game.version) || game.version < 1 || game.version > MAX_RECEIPTS ||
      Object.keys(game.receipts).length !== game.version || Object.keys(game.players).length > MAX_PLAYERS ||
      Object.keys(game.approved).length > MAX_PLAYERS || Buffer.byteLength(JSON.stringify(game), "utf8") > MAX_GAME_BYTES) return false;
  for (const [actor, room] of Object.entries(game.players)) {
    if (!roomId(room) || game.approved[actor] !== true || !validAttributes(game.attributes[actor]) ||
        !Number.isInteger(game.resolve[actor]) || game.resolve[actor] < 0 || game.resolve[actor] > 6 || !Array.isArray(game.inventory[actor]) ||
        !game.inventory[actor].every(itemId)) return false;
  }
  if (Object.values(game.world.flags).some((flag) => typeof flag !== "boolean") ||
      ["pumpOpen", "stairOpen", "lineFound"].some((flag) => typeof game.world.flags[flag] !== "boolean")) return false;
  for (const item of ["safety-line", "hand-mirror", "glass-prism"] as ItemId[]) {
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
  if (!id || !store.observe || !store.compareAndApply || !ctx.getCurrentConversationBinding) return denied;
  const cmd = parse(ctx.args);
  if (!cmd) return help;
  // Resolve *this invocation's* destination through the host, not user text.
  ctx.assertOwnerCurrent!();
  const target = destination(ctx, id, await ctx.getCurrentConversationBinding());
  ctx.assertOwnerCurrent!();
  if (!target) return denied;
  // The namespace is retained. Agent and conversation identity are both part of the key,
  // and the stored binding must still match before any response or effect.
  const key = JSON.stringify([id.agentId, id.sessionId, target]);
  for (let attempts = 0; attempts < 5; attempts++) {
    ctx.assertOwnerCurrent!();
    const observed = await store.observe(key);
    ctx.assertOwnerCurrent!();
    if (destination(ctx, id, await ctx.getCurrentConversationBinding()) !== target) return denied;
    ctx.assertOwnerCurrent!();
    const current = observed.value;
    if (current && !bound(current, id, target)) return denied;
    // A prior prototype's row is not a valid world save; never silently reset it.
    if (current && !validGame(current, key)) return denied;
    if (cmd.verb === "look") {
      if (!current || !Object.hasOwn(current.players, id.actor)) return denied;
      ctx.assertOwnerCurrent!();
      return describe(current, id.actor);
    }
    if (cmd.verb === "inventory" || cmd.verb === "recap") {
      if (!current || !Object.hasOwn(current.players, id.actor)) return denied;
      if (destination(ctx, id, await ctx.getCurrentConversationBinding()) !== target) return denied;
      ctx.assertOwnerCurrent!();
      if (cmd.verb === "inventory") return `Inventory: ${current.inventory[id.actor]?.join(", ") || "empty"}. Version ${current.version}.`;
      if (cmd.verb === "recap") return `Public journal: ${current.world.journal.slice(-8).join("; ") || "no discoveries"}. Version ${current.version}.`;
    }
    const rkey = receiptKey(id.actor, cmd.requestId!);
    const prior = current?.receipts[rkey];
    if (prior) {
      if (prior.fingerprint !== fingerprint(cmd)) return "Request id already used for another action.";
      if (cmd.verb === "join" && cmd.gameId !== current?.id) return denied;
      ctx.assertOwnerCurrent!();
      return prior.text;
    }
    let next: Game;
    let text: string;
    if (cmd.verb === "create") {
      if (current) return "A game already exists in this conversation.";
      next = {
        id: randomUUID(), agentId: id.agentId, sessionId: id.sessionId,
        sessionKey: id.sessionKey, destination: target, owner: id.actor,
        approved: { [id.actor]: true }, players: { [id.actor]: "quay" }, attributes: { [id.actor]: { grit: 1, wits: 2, charm: 0 } },
        resolve: { [id.actor]: 6 }, inventory: { [id.actor]: [] }, world: initialWorld(), receipts: {}, version: 1,
      };
      text = `Created game ${next.id}. ${describe(next, id.actor)}`;
    } else {
      if (!current) return denied;
      if (cmd.verb === "approve") {
        if (current.owner !== id.actor) return denied;
        const approvedActor = JSON.stringify([id.channel, id.accountId, cmd.sender]);
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
        if (at === "quay" && cmd.target === "cleat") flags.lineFound = true;
        const journal = [...current.world.journal, `An object was examined in ${at}.`];
        next = { ...current, world: { ...current.world, flags, journal }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `${found} Version ${next.version}.`;
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
      } else {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const at = current.players[id.actor];
        if ((cmd.target === "pump-hatch" && at !== "pump" && at !== "archive") ||
            (cmd.target === "tower-stair" && at !== "tower" && at !== "archive")) return "That mechanism is not here.";
        const flags = { ...current.world.flags, [cmd.target === "pump-hatch" ? "pumpOpen" : "stairOpen"]: true };
        next = { ...current, world: { ...current.world, flags, journal: [...current.world.journal, `A route to the Archive was opened.`] },
          receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Opened ${cmd.target}. Version ${next.version}.`;
      }
    }
    // Prevent unbounded retained rows: reject before a receipt can be silently evicted.
    if (Object.keys(next.receipts).length >= MAX_RECEIPTS) return "Receipt capacity reached; game requires maintenance.";
    next.receipts[rkey] ??= { fingerprint: fingerprint(cmd), text };
    if (Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_GAME_BYTES) return "Game capacity reached; game requires maintenance.";
    ctx.assertOwnerCurrent!();
    if (destination(ctx, id, await ctx.getCurrentConversationBinding()) !== target) return denied;
    ctx.assertOwnerCurrent!();
    const result = await store.compareAndApply(key, observed.comparison, { operation: "update", action: "set", value: next });
    ctx.assertOwnerCurrent!();
    if (result.status === "applied") {
      if (destination(ctx, id, await ctx.getCurrentConversationBinding()) !== target) return denied;
      ctx.assertOwnerCurrent!();
      return text;
    }
    if (result.status !== "conflict") return denied;
  }
  return "Campaign Keeper: concurrent update; retry with the same request id.";
}

const storeOptions = { namespace: "campaign-keeper-spike-v2", maxEntries: 64, overflowPolicy: "reject-new" } as const;

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
    games.push({ gameId: game.id, label: `Game ${games.length + 1}`, playerCount: Object.keys(game.players).length,
      acceptedActions: game.version });
  }
  client?.assertCurrent?.();
  if (!permitted()) return null;
  const asOfVersion = games.reduce((sum, game) => sum + game.acceptedActions, 0);
  if (!Number.isSafeInteger(asOfVersion)) return null;
  return { totalGames: games.length, activeGames: games.length, completedGames: 0,
    acceptedActions: asOfVersion, games, asOfVersion, status: "complete" };
}

export function registerEngine(api: Pick<OpenClawPluginApi, "registerCommand" | "runtime" | "session" | "pluginConfig">): void {
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
        return { text: await runCommand(ctx, store) };
      } catch {
        // No state, internals or binding details leaked when storage or authority fails.
        return { text: denied };
      }
    },
  });
}
