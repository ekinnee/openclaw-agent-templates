import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand, registerEngine, readGameStats, scenePrompt } from "./engine.ts";
import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";

type Store = PluginStateKeyedStore<any, 2>;
function fixture() {
  const rows = new Map<string, any>();
  const revisions = new Map<string, number>();
  const binding = { bindingId: "approved-1", channel: "chat", accountId: "account", conversationId: "room", threadId: "thread" };
  let currentBinding: any = binding;
  let ownerCurrent = true;
  const store = {
    async observe(key: string) { return { value: rows.get(key), comparison: String(revisions.get(key) ?? 0) }; },
    async entries() { return [...rows].map(([key, value]) => ({ key, value, createdAt: 1 })); },
    async compareAndApply(key: string, comparison: string, intent: any) {
      if (comparison !== String(revisions.get(key) ?? 0)) return { status: "conflict", current: await this.observe(key) };
      rows.set(key, structuredClone(intent.value));
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      return { status: "applied" };
    },
  } as Store;
  const context = (args: string, patch: Record<string, unknown> = {}) => ({
    args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderIsOwner: true,
    assertOwnerCurrent: () => { if (!ownerCurrent) throw Error("owner no longer current"); },
    getCurrentConversationBinding: async () => currentBinding,
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:chat:room", sessionId: "incarnation-a",
    channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread", ...patch,
  }) as PluginCommandContext;
  return { rows, revisions, store, context, binding, setBinding: (v: any) => { currentBinding = v; }, revoke: () => { ownerCurrent = false; } };
}

test("owner authority and approved destination are mandatory", async () => {
  const f = fixture();
  for (const patch of [
    { isAuthorizedSender: false }, { senderIsOwner: false }, { assertOwnerCurrent: undefined },
    { senderId: undefined }, { agentId: undefined }, { sessionKey: undefined }, { sessionId: undefined },
    { accountId: undefined }, { from: undefined }, { to: undefined },
    { messageThreadId: undefined }, { getCurrentConversationBinding: undefined },
  ]) assert.match(await runCommand(f.context("create req1", patch), f.store), /unavailable/);
  f.setBinding(null);
  assert.match(await runCommand(f.context("create req1"), f.store), /unavailable/);
  f.setBinding(f.binding);
  assert.match(await runCommand(f.context("create req1"), f.store), /Created game/);
  assert.equal(f.rows.size, 1);
  for (const patch of [{ agentId: "other" }, { sessionKey: "other" }, { sessionId: "other" }, { channel: "other" },
    { accountId: "other" }, { messageThreadId: "other" }, { threadParentId: "other" },
    { from: "other" }, { to: "other" }])
    assert.match(await runCommand(f.context("look", patch), f.store), /unavailable/);
  f.setBinding({ ...f.binding, bindingId: "approved-2" });
  assert.match(await runCommand(f.context("look"), f.store), /unavailable/);
});

test("scene continuation receives only an authorized committed player projection", async () => {
  const f = fixture();
  assert.equal(await scenePrompt(f.context("scene"), f.store), null);
  await runCommand(f.context("create start"), f.store);
  const prompt = await scenePrompt(f.context("scene"), f.store);
  assert.match(prompt!, /Lantern Quay.*asOfVersion/);
  assert.doesNotMatch(prompt!, /bindingId|destination|approved|glass-prism|harbor-plan|weather-crate/);
  assert.equal(await scenePrompt(f.context("scene", { senderId: "bob", senderIsOwner: false, assertOwnerCurrent: undefined }), f.store), null);
  f.setBinding({ ...f.binding, bindingId: "new-binding" });
  assert.equal(await scenePrompt(f.context("scene"), f.store), null);
});

test("registered scene command hands a bounded committed projection to the agent", async () => {
  const f = fixture();
  let command: any;
  registerEngine({ pluginConfig: {}, registerCommand: (definition: any) => { command = definition; },
    session: { controls: {} }, runtime: { state: { openKeyedStoreV2: () => f.store } } } as any);
  assert.deepEqual(await command.handler(f.context("scene")), { text: "Campaign Keeper: unavailable or not authorized for this conversation." });
  await runCommand(f.context("create start"), f.store);
  const result = await command.handler(f.context("scene"));
  assert.match(result.continueAgent?.prompt, /Campaign Keeper scene request.*Lantern Quay/);
  assert.equal(result.text, undefined);
  assert.equal(command.requireAuth, true);
  assert.deepEqual(command.requiredScopes, ["operator.write"]);
});

test("UUID possession never grants a non-owner membership or a state effect", async () => {
  const f = fixture();
  const created = await runCommand(f.context("create request1"), f.store);
  const gameId = created.match(/Created game ([0-9a-f-]{36})/)?.[1];
  assert.ok(gameId);
  const bob = { senderId: "bob", senderIsOwner: false, assertOwnerCurrent: undefined };
  assert.match(await runCommand(f.context(`join ${gameId} bob1`, bob), f.store), /unavailable/);
  assert.match(await runCommand(f.context("look", bob), f.store), /unavailable/);
  assert.match(await runCommand(f.context("approve bob p1", bob), f.store), /unavailable/);
  assert.equal(f.rows.size, 1);
  assert.match(await runCommand(f.context("approve bob p1"), f.store), /Approved sender/);
  assert.equal(await runCommand(f.context("approve bob p1"), f.store), "Approved sender for game " + gameId + ".");
  assert.match(await runCommand(f.context(`join ${gameId} bob1`, bob), f.store), /unavailable/);
  assert.equal(Object.keys([...f.rows.values()][0].players).length, 1);
  assert.equal(await runCommand(f.context("create request1"), f.store), created);
  const moved = await runCommand(f.context("move market m1"), f.store);
  assert.match(moved, /Tide Market/);
  assert.equal(await runCommand(f.context("move market m1"), f.store), moved);
});

test("revoked owner after an awaited read cannot commit", async () => {
  const f = fixture();
  const original = f.store.observe!.bind(f.store);
  f.store.observe = async (key) => { const result = await original(key); f.revoke(); return result; };
  await assert.rejects(() => runCommand(f.context("create req"), f.store), /owner no longer current/);
  assert.equal(f.rows.size, 0);
});

test("binding replacement during an awaited observe refuses effect", async () => {
  const f = fixture();
  const original = f.store.observe!.bind(f.store);
  f.store.observe = async (key) => { const result = await original(key); f.setBinding({ ...f.binding, conversationId: "elsewhere" }); return result; };
  assert.match(await runCommand(f.context("create req"), f.store), /unavailable/);
  assert.equal(f.rows.size, 0);
});

test("capacity, CAS conflicts, and missing CAS refuse mutation", async () => {
  const f = fixture();
  let conflict = true;
  const original = f.store.compareAndApply!.bind(f.store);
  f.store.compareAndApply = async (key, comparison, intent) => {
    if (conflict) { conflict = false; return { status: "conflict", current: await f.store.observe!(key) }; }
    return original(key, comparison, intent);
  };
  assert.match(await runCommand(f.context("create retry"), f.store), /Created game/);
  const key = [...f.rows.keys()][0];
  const game = f.rows.get(key);
  // Refuse malformed or altered persisted rows rather than silently ignoring them.
  for (let n = 0; n < 63; n++) game.receipts[`receipt-${n}`] = { fingerprint: "test", text: "test" };
  assert.match(await runCommand(f.context("move market over-cap"), f.store), /unavailable/);
  assert.equal(f.rows.get(key).version, 1);
  assert.match(await runCommand(f.context("look"), { observe: f.store.observe } as Store), /unavailable/);
  game.receipts = {};
  game.receipts.huge = { fingerprint: "test", text: "x".repeat(65536) };
  assert.match(await runCommand(f.context("move market bytes"), f.store), /unavailable/);
});

test("owner approval has a fixed four-actor capacity", async () => {
  const f = fixture();
  await runCommand(f.context("create seed"), f.store);
  for (const actor of ["bob", "carol", "dave"])
    assert.match(await runCommand(f.context(`approve ${actor} allow-${actor}`), f.store), /Approved/);
  assert.match(await runCommand(f.context("approve eve allow-eve"), f.store), /full/);
  assert.equal(Object.keys([...f.rows.values()][0].approved).length, 4);
});

test("registration requests bounded reject-new storage and owner-capable gateway scope", async () => {
  const f = fixture();
  let definition: any;
  let options: any;
  registerEngine({
    registerCommand: (command: any) => { definition = command; },
    runtime: { state: { openKeyedStoreV2: (opts: any) => { options = opts; return f.store; } } },
  } as any);
  assert.equal(definition.requireAuth, true);
  assert.deepEqual(definition.requiredScopes, ["operator.write"]);
  assert.match((await definition.handler(f.context("create req"))).text, /Created game/);
  assert.equal(options.maxEntries, 64);
  assert.equal(options.overflowPolicy, "reject-new");
  assert.match((await definition.handler(f.context("look", { senderIsOwner: false }))).text, /unavailable/);
});

test("game incarnations use trusted sessionId, empty sessions count zero, retry does not double-count", async () => {
  const f = fixture();
  const access = () => ({ agentId: "keeper", sessionKey: "agent:keeper:chat:room",
    client: { scopes: ["operator.read"], allowsAgent: (agent: string) => agent === "keeper",
      isSharedGateway: () => false, assertCurrent: () => {} } });
  const stats = () => readGameStats(access() as any, f.store, "keeper");
  assert.equal((await stats())?.totalGames, 0);
  const a = await runCommand(f.context("create first"), f.store);
  assert.match(a, /Created game/);
  assert.equal(await runCommand(f.context("create first"), f.store), a);
  assert.equal((await stats())?.totalGames, 1);
  assert.match(await runCommand(f.context("create next", { sessionId: "incarnation-b" }), f.store), /Created game/);
  assert.equal((await stats())?.totalGames, 2);
  assert.equal((await stats())?.acceptedActions, 2);
  assert.match(await runCommand(f.context("move market m1"), f.store), /Moved/);
  assert.equal((await stats())?.acceptedActions, 3);
  assert.match(await runCommand(f.context("move quay return"), f.store), /Lantern Quay/);
  assert.match(await runCommand(f.context("talk mara stakes"), f.store), /Deferring repairs needs/);
  assert.match(await runCommand(f.context("warn evacuate warning"), f.store), /Committed evacuate warning/);
  assert.match(await runCommand(f.context("finish deferred end"), f.store), /Committed deferred ending/);
  assert.equal((await stats())?.completedGames, 1);
  assert.equal((await stats())?.activeGames, 1);
  assert.equal((await stats())?.games[0].playerCount, 1);
  assert.deepEqual(Object.keys((await stats())!.games[0]).sort(), ["acceptedActions", "gameId", "label", "playerCount"]);
});

test("stats reject cross-agent readers, revoked roles, malformed rows, and capacity anomalies", async () => {
  const f = fixture();
  await runCommand(f.context("create first"), f.store);
  const base = { agentId: "keeper", sessionKey: "agent:keeper:chat:room",
    client: { scopes: ["operator.read"], allowsAgent: () => true, isSharedGateway: () => false,
      assertCurrent: () => {} } };
  const read = (ctx: any) => readGameStats(ctx, f.store, "keeper");
  assert.equal(await read({ ...base, agentId: "other" }), null);
  assert.equal(await read({ ...base, client: { ...base.client, allowsAgent: () => false } }), null);
  assert.equal(await read({ ...base, client: { ...base.client, scopes: [] } }), null);
  assert.equal(await read({ ...base, client: { ...base.client, isSharedGateway: undefined } }), null);
  assert.equal(await read({ ...base, client: { ...base.client, assertCurrent: undefined } }), null);
  assert.equal(await read({ ...base, client: { ...base.client, isSharedGateway: () => true } }), null);
  const original = f.store.entries!.bind(f.store);
  f.store.entries = async () => { const entries = await original(); base.client.allowsAgent = () => false; return entries; };
  assert.equal(await read(base), null);
  f.store.entries = original;
  base.client.allowsAgent = () => true;
  const key = [...f.rows.keys()][0];
  const game = f.rows.get(key);
  game.sessionId = "other";
  assert.equal(await read(base), null);
  game.sessionId = "incarnation-a";
  const world = game.world;
  game.world = undefined;
  assert.equal(await read(base), null);
  assert.match(await runCommand(f.context("look"), f.store), /unavailable/);
  game.world = world;
  const attributes = game.attributes[game.owner];
  game.attributes[game.owner] = { grit: "0", wits: "1", charm: "2" };
  assert.equal(await read(base), null);
  assert.match(await runCommand(f.context("roll charm bad"), f.store), /unavailable/);
  game.attributes[game.owner] = attributes;
  f.store.entries = async () => Array.from({ length: 65 }, () => ({ key, value: game, createdAt: 1 }));
  assert.equal(await read(base), null);
});

test("stats action and widget descriptor share explicit opt-in and read scope", async () => {
  const f = fixture();
  const registered: any[] = [];
  const descriptors: any[] = [];
  const api = (enabled: boolean) => ({ pluginConfig: { dashboardEnabled: enabled, agentId: "keeper" },
    session: { controls: { registerSessionAction: (action: any) => registered.push(action),
      registerControlUiDescriptor: (descriptor: any) => descriptors.push(descriptor) } },
    registerCommand: () => {}, runtime: { state: { openKeyedStoreV2: () => f.store } } });
  registerEngine(api(false) as any);
  assert.equal(registered.length, 0);
  assert.equal(descriptors.length, 0);
  registerEngine(api(true) as any);
  assert.equal(registered.length, 1);
  assert.deepEqual(descriptors, [{ surface: "widget", id: "game-stats", label: "Campaign Keeper statistics",
    requiredScopes: ["operator.read"] }]);
  assert.deepEqual(registered[0].requiredScopes, ["operator.read"]);
  assert.equal((await registered[0].handler({ agentId: "keeper", sessionKey: "session", client: {
    scopes: ["operator.read"], allowsAgent: () => true, isSharedGateway: () => false,
    assertCurrent: () => {} } })).result.totalGames, 0);
});
