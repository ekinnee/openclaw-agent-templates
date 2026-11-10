// Narrow deterministic command owner. No model, filesystem writes, or player-facing GM material.
import { randomUUID } from "node:crypto";
import type { PluginCommandContext, OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";

type Store = PluginStateKeyedStore<Game, 2>;
type Position = "quay" | "market";
type Receipt = { fingerprint: string; text: string };
type Game = {
  id: string;
  agentId: string;
  sessionKey: string;
  channel: string;
  accountId: string | null;
  threadId: string | null;
  threadParentId: string | null;
  owner: string;
  players: Record<string, Position>;
  receipts: Record<string, Receipt>;
  version: number;
};
type Command = { verb: "create" | "join" | "look" | "move"; requestId?: string; direction?: Position; gameId?: string };

const token = /^[a-zA-Z0-9_-]{1,64}$/;
function parse(args: string | undefined): Command | null {
  const words = (args ?? "").trim().split(/\s+/);
  if (words[0] === "look" && words.length === 1) return { verb: "look" };
  if (words[0] === "create" && words.length === 2 && token.test(words[1])) return { verb: "create", requestId: words[1] };
  if (words[0] === "join" && words.length === 3 && /^[0-9a-f-]{36}$/.test(words[1]) && token.test(words[2]))
    return { verb: "join", gameId: words[1], requestId: words[2] };
  if (words[0] === "move" && words.length === 3 && (words[1] === "quay" || words[1] === "market") && token.test(words[2]))
    return { verb: "move", direction: words[1] as Position, requestId: words[2] };
  return null;
}

function identity(ctx: PluginCommandContext) {
  if (!ctx.isAuthorizedSender || !ctx.senderId?.trim() || !ctx.agentId?.trim() || !ctx.sessionKey?.trim() || !ctx.channel?.trim()) return null;
  return {
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    channel: ctx.channel,
    accountId: ctx.accountId ?? null,
    threadId: ctx.messageThreadId == null ? null : String(ctx.messageThreadId),
    threadParentId: ctx.threadParentId ?? null,
    actor: JSON.stringify([ctx.channel, ctx.accountId ?? null, ctx.senderId]),
  };
}
type Identity = NonNullable<ReturnType<typeof identity>>;
function bound(game: Game, id: Identity): boolean {
  return game.agentId === id.agentId && game.sessionKey === id.sessionKey && game.channel === id.channel &&
    game.accountId === id.accountId && game.threadId === id.threadId && game.threadParentId === id.threadParentId;
}
function describe(game: Game, actor: string): string {
  const position = game.players[actor];
  return position === "quay"
    ? `Lantern Quay. The beacon is dark. Exits: market. Game ${game.id}; version ${game.version}.`
    : `Tide Market. The stalls stand quiet. Exits: quay. Game ${game.id}; version ${game.version}.`;
}
function receiptKey(actor: string, requestId: string): string { return JSON.stringify([actor, requestId]); }
function fingerprint(cmd: Command): string { return JSON.stringify([cmd.verb, cmd.gameId ?? null, cmd.direction ?? null]); }
const help = "Usage: /ck create <request-id> | join <game-id> <request-id> | look | move <quay|market> <request-id>";
const denied = "Campaign Keeper: unavailable or not authorized for this conversation.";

/** Pure owner over an action-bound V2 state store; a conflict is the only retryable outcome. */
export async function runCommand(ctx: PluginCommandContext, store: Store): Promise<string> {
  const id = identity(ctx);
  if (!id || !store.observe || !store.compareAndApply) return denied;
  const cmd = parse(ctx.args);
  if (!cmd) return help;
  // The namespace is retained. Agent and conversation identity are both part of the key,
  // and the stored binding must still match before any response or effect.
  const key = JSON.stringify([id.agentId, id.sessionKey]);
  for (let attempts = 0; attempts < 5; attempts++) {
    const observed = await store.observe(key);
    const current = observed.value;
    if (current && !bound(current, id)) return denied;
    if (cmd.verb === "look") {
      if (!current || !Object.hasOwn(current.players, id.actor)) return denied;
      return describe(current, id.actor);
    }
    const rkey = receiptKey(id.actor, cmd.requestId!);
    const prior = current?.receipts[rkey];
    if (prior) {
      if (prior.fingerprint !== fingerprint(cmd)) return "Request id already used for another action.";
      if (cmd.verb === "join" && cmd.gameId !== current?.id) return denied;
      return prior.text;
    }
    let next: Game;
    let text: string;
    if (cmd.verb === "create") {
      if (current) return "A game already exists in this conversation.";
      next = {
        id: randomUUID(), agentId: id.agentId, sessionKey: id.sessionKey, channel: id.channel,
        accountId: id.accountId, threadId: id.threadId, threadParentId: id.threadParentId, owner: id.actor,
        players: { [id.actor]: "quay" }, receipts: {}, version: 1,
      };
      text = `Created game ${next.id}. ${describe(next, id.actor)}`;
    } else {
      if (!current) return denied;
      if (cmd.verb === "join") {
        if (cmd.gameId !== current.id) return denied;
        if (!Object.hasOwn(current.players, id.actor) && Object.keys(current.players).length >= 4) return "Game is full.";
        next = { ...current, players: { ...current.players, [id.actor]: current.players[id.actor] ?? "quay" }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `Joined game ${next.id}. ${describe(next, id.actor)}`;
      } else {
        if (!Object.hasOwn(current.players, id.actor)) return denied;
        const alreadyThere = current.players[id.actor] === cmd.direction;
        next = { ...current, players: { ...current.players, [id.actor]: cmd.direction! }, receipts: { ...current.receipts }, version: current.version + 1 };
        text = `${alreadyThere ? "Already there." : "Moved."} ${describe(next, id.actor)}`;
      }
    }
    // Prevent unbounded retained rows: reject before a receipt can be silently evicted.
    if (Object.keys(next.receipts).length >= 256) return "Receipt capacity reached; game requires maintenance.";
    next.receipts[rkey] = { fingerprint: fingerprint(cmd), text };
    const result = await store.compareAndApply(key, observed.comparison, { operation: "update", action: "set", value: next });
    if (result.status === "applied") return text;
    if (result.status !== "conflict") return denied;
  }
  return "Campaign Keeper: concurrent update; retry with the same request id.";
}

export function registerEngine(api: Pick<OpenClawPluginApi, "registerCommand" | "runtime">): void {
  api.registerCommand({
    name: "ck", description: "Campaign Keeper capability spike", acceptsArgs: true, requireAuth: true,
    handler: async (ctx) => {
      // Each invocation uses host-provided authority; no cached writable store or ambient identity.
      const actor = identity(ctx);
      if (!actor) return { text: denied };
      try {
        const store = api.runtime.state.openKeyedStoreV2<Game>(
          { namespace: "campaign-keeper-spike-v1", retention: "retained" },
          ctx.assertOwnerCurrent ? { assertCurrent: ctx.assertOwnerCurrent } : undefined,
        );
        return { text: await runCommand(ctx, store) };
      } catch {
        // No state, internals or binding details leaked when storage or authority fails.
        return { text: denied };
      }
    },
  });
}
