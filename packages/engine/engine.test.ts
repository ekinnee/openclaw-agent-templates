import { test } from "node:test";
import assert from "node:assert/strict";
import { launchedScene, launchedManagement, runCommand, registerEngine, readGameStats, scenePrompt, runPlayerIntent, registerPlayerIntentTool } from "./engine.ts";
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

test("owner chooses one of the authored solo archetypes at creation without replay switching", async () => {
  for (const [archetype, attributes] of [
    ["quay-runner", { grit: 1, wits: 2, charm: 0 }],
    ["tidehand", { grit: 2, wits: 1, charm: 0 }],
    ["lantern-singer", { grit: 0, wits: 1, charm: 2 }],
  ] as const) {
    const f = fixture();
    const command = `create ${archetype} start`;
    const created = await runCommand(f.context(command), f.store);
    assert.match(created, new RegExp(`with ${archetype}`));
    const saved = [...f.rows.values()][0];
    assert.deepEqual(saved.attributes[saved.owner], attributes);
    assert.equal(await runCommand(f.context(command), f.store), created);
    assert.match(await runCommand(f.context("create start"), f.store), /already used/);
    assert.equal([...f.rows.values()][0].version, 1);
  }
  const f = fixture();
  assert.match(await runCommand(f.context("create unknown start"), f.store), /Usage:/);
  assert.equal(f.rows.size, 0);
});

test("WebChat owner can create and resume on its host session without a channel binding", async () => {
  const f = fixture();
  const web = (args: string, patch: Record<string, unknown> = {}) => f.context(args, {
    channel: "webchat", accountId: undefined, from: undefined, to: undefined,
    messageThreadId: undefined, getCurrentConversationBinding: undefined,
    sessionKey: "agent:keeper:dashboard:owned", senderId: "profile-owner",
    gatewayClientScopes: ["operator.admin", "operator.write"], ...patch,
  });
  assert.match(await runCommand(web("create quay-runner start"), f.store), /Created game/);
  assert.equal(f.rows.size, 1);
  const game = [...f.rows.values()][0];
  assert.equal(game.destination, JSON.stringify(["webchat-owner", "keeper", "agent:keeper:dashboard:owned", "incarnation-a"]));
  assert.equal(game.owner, JSON.stringify(["webchat", "webchat-owner", "profile-owner"]));
  assert.match(await runCommand(web("look"), f.store), /Lantern Quay/);
  assert.match((await scenePrompt(web("scene"), f.store))!, /Lantern Quay/);
  const moved = await runCommand(web("move market next"), f.store);
  assert.match(moved, /Tide Market/);
  assert.equal(await runCommand(web("move market next"), f.store), moved);
  assert.match(await runCommand(web("look", { sessionId: "incarnation-b" }), f.store), /unavailable/);
  assert.match(await runCommand(web("look", { sessionKey: "agent:other:dashboard:owned" }), f.store), /unavailable/);
});

test("WebChat route refuses nonowners, absent admin scope and revoked owners", async () => {
  const f = fixture();
  const web = (args: string, patch: Record<string, unknown> = {}) => f.context(args, {
    channel: "webchat", accountId: undefined, from: undefined, to: undefined,
    messageThreadId: undefined, getCurrentConversationBinding: undefined,
    sessionKey: "agent:keeper:dashboard:owned", senderId: "profile-owner",
    gatewayClientScopes: ["operator.admin", "operator.write"], ...patch,
  });
  for (const patch of [
    { senderIsOwner: false }, { isAuthorizedSender: false }, { assertOwnerCurrent: undefined },
    { gatewayClientScopes: ["operator.write"] }, { senderId: undefined }, { sessionId: undefined },
  ]) assert.match(await runCommand(web("create start", patch), f.store), /unavailable/);
  assert.equal(f.rows.size, 0);
  const original = f.store.observe!.bind(f.store);
  f.store.observe = async (key) => { const observed = await original(key); f.revoke(); return observed; };
  await assert.rejects(() => runCommand(web("create start"), f.store), /owner no longer current/);
  assert.equal(f.rows.size, 0);
});

test("scene continuation receives only an authorized committed player projection", async () => {
  const f = fixture();
  assert.equal(await scenePrompt(f.context("scene"), f.store), null);
  await runCommand(f.context("create start"), f.store);
  const prompt = await scenePrompt(f.context("scene"), f.store);
  assert.match(prompt!, /Lantern Quay.*asOfVersion/);
  assert.doesNotMatch(prompt!, /bindingId|destination|approved|glass-prism|harbor-plan|weather-crate/);
  assert.equal(await scenePrompt(f.context("scene", { senderId: "bob", senderIsOwner: false, assertOwnerCurrent: undefined }), f.store), null);
  assert.equal(await scenePrompt(f.context("scene", { senderId: "bob" }), f.store), null);
  f.setBinding({ ...f.binding, bindingId: "new-binding" });
  assert.equal(await scenePrompt(f.context("scene"), f.store), null);
});

test("scene read refuses owner demotion or binding change across awaited state work", async () => {
  const demoted = fixture();
  await runCommand(demoted.context("create start"), demoted.store);
  const observe = demoted.store.observe!.bind(demoted.store);
  demoted.store.observe = async (key) => { const value = await observe(key); demoted.revoke(); return value; };
  await assert.rejects(() => scenePrompt(demoted.context("scene"), demoted.store), /owner no longer current/);
  const rebound = fixture();
  await runCommand(rebound.context("create start"), rebound.store);
  const read = rebound.store.observe!.bind(rebound.store);
  rebound.store.observe = async (key) => { const value = await read(key); rebound.setBinding({ ...rebound.binding, bindingId: "rebound" }); return value; };
  assert.equal(await scenePrompt(rebound.context("scene"), rebound.store), null);
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

test("the 64th receipt commits, while a 65th is refused without eviction", async () => {
  const f = fixture();
  await runCommand(f.context("create first"), f.store);
  for (let n = 1; n < 64; n++) {
    const result = await runCommand(f.context(`move ${n % 2 ? "market" : "quay"} step-${n}`), f.store);
    assert.match(result, /Moved/);
  }
  const saved = [...f.rows.values()][0];
  assert.equal(saved.version, 64);
  assert.equal(Object.keys(saved.receipts).length, 64);
  assert.match(await runCommand(f.context("move quay overflow"), f.store), /capacity reached/);
  assert.equal([...f.rows.values()][0].version, 64);
  assert.equal(await runCommand(f.context("move market step-63"), f.store), saved.receipts[JSON.stringify([saved.owner, "step-63"])].text);
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
  const owner = game.owner;
  game.owner = "unknown-actor";
  assert.equal(await read(base), null);
  assert.match(await runCommand(f.context("look"), f.store), /unavailable/);
  game.owner = owner;
  game.inventory[owner] = ["safety-line", "safety-line"];
  game.world.items["safety-line"] = owner;
  assert.equal(await read(base), null);
  assert.match(await runCommand(f.context("look"), f.store), /unavailable/);
  game.inventory[owner] = [];
  game.world.items["safety-line"] = "quay";
  game.resolve.extra = 5;
  assert.equal(await read(base), null);
  game.resolve = { [owner]: 6 };
  f.store.entries = async () => Array.from({ length: 65 }, () => ({ key, value: game, createdAt: 1 }));
  assert.equal(await read(base), null);
});

test("unknown and older save schemas fail closed without rewriting the game or stats", async () => {
  const f = fixture();
  assert.match(await runCommand(f.context("create start"), f.store), /Created game/);
  const key = [...f.rows.keys()][0];
  const original = structuredClone(f.rows.get(key));
  assert.equal(original.saveSchemaVersion, 1);
  const statsContext = { agentId: "keeper", sessionKey: "agent:keeper:chat:room",
    client: { scopes: ["operator.read"], allowsAgent: () => true, isSharedGateway: () => false,
      assertCurrent: () => {} } } as any;
  for (const incompatible of [undefined, 0, 2, "1"]) {
    const row = structuredClone(original);
    if (incompatible === undefined) delete row.saveSchemaVersion;
    else row.saveSchemaVersion = incompatible;
    f.rows.set(key, row);
    assert.match(await runCommand(f.context("look"), f.store), /unavailable/);
    assert.match(await runCommand(f.context("move market stale"), f.store), /unavailable/);
    assert.equal(await readGameStats(statsContext, f.store, "keeper"), null);
    assert.deepEqual(f.rows.get(key), row);
  }
  f.rows.set(key, original);
  assert.match(await runCommand(f.context("look"), f.store), /Lantern Quay/);
  assert.equal((await readGameStats(statsContext, f.store, "keeper"))?.activeGames, 1);
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

// Fixtures only: host-stamped contexts are supplied by the test, not live messaging.
function intentFixture() {
  const f = fixture();
  const human: any = { inputProvenance: { kind: "external_user" }, agentId: "keeper", sessionKey: "agent:keeper:gm", sessionId: "gm-1",
    senderIsOwner: true, requesterProfile: { id: "erick", assertCurrent() {} }, messageChannel: "webchat",
    assertInvocationCurrent: () => {} };
  const agent: any = { ...human, inputProvenance: { kind: "inter_session", sourceTool: "sessions_send",
    sourceSessionKey: "agent:main:player" } };
  return { ...f, human, agent };
}
test("launcher binds one Keeper-owned game to the player's exact chat and retries without a second effect", async () => {
  const f = intentFixture();
  const keeper = { agentId: "keeper", sessionKey: "agent:keeper:dashboard:gm", sessionId: "gm-1" };
  const player = { agentId: "player", sessionKey: "agent:player:dashboard:ck-play-fixture", sessionId: "play-1" };
  const route = { keeper, player, profileId: "erick", assertCurrent() {} };
  const first = await launchedScene(route, f.store, "tidehand");
  assert.equal(first?.room, "Lantern Quay");
  assert.equal(first?.character, "Tidehand");
  assert.deepEqual(await launchedScene(route, f.store, "tidehand"), first);
  assert.equal(await launchedScene(route, f.store, "lantern-singer"), null);
  assert.equal(f.rows.size, 1);
  const game = [...f.rows.values()][0];
  assert.equal(game.sessionKey, keeper.sessionKey);
  assert.equal(game.version, 1);
  assert.equal(Object.keys(game.receipts).length, 1);
  assert.deepEqual(game.attributes[game.owner], { grit: 2, wits: 1, charm: 0 });
  assert.deepEqual(game.starterSession, player);
  assert.equal(await launchedScene({ ...route, profileId: "other" }, f.store, "tidehand"), null);
  assert.equal(await launchedScene({ ...route, player: { ...player, sessionId: "reset" } }, f.store), null);
  const ctx = { ...f.human, ...player, senderIsOwner: false };
  const move = { action: "move", target: "tower", requestId: "move" };
  assert.match(await runPlayerIntent(ctx, move, f.store), /unavailable/);
  assert.match(await runPlayerIntent({ ...ctx, sessionId: "reset" }, move, f.store, route), /unavailable/);
  assert.match(await runPlayerIntent(ctx, move, f.store, route), /Beacon Tower/);
  assert.equal((await launchedScene(route, f.store))?.room, "Beacon Tower");
  assert.deepEqual(await launchedManagement(keeper, f.store, route.assertCurrent), { version: 2, players: 1, room: "Beacon Tower" });
});
test("natural language GM intent fixture keeps human sponsor and agent player distinct; replay and wrong actors", async () => {
  const f = intentFixture();
  // GM translates 'Start a game', 'Let the main assistant play', and 'I head to the tavern'.
  assert.match(await runPlayerIntent(f.human, { action: "create", requestId: "start" }, f.store), /Created/);
  const gameId = [...f.rows.values()][0].id;
  assert.match(await runPlayerIntent(f.agent, { action: "join", gameId, requestId: "join" }, f.store), /unavailable/);
  const beforeInvalidEnrollment = structuredClone([...f.rows.values()][0]);
  for (const invalid of [undefined, "00000000-0000-0000-0000-000000000000", "not-a-uuid"]) {
    assert.match(await runPlayerIntent(f.human, { action: "enroll", sourceSessionKey: "agent:main:player",
      gameId: invalid, requestId: "approve" }, f.store), /unavailable/);
    assert.deepEqual([...f.rows.values()][0], beforeInvalidEnrollment);
  }
  assert.match(await runPlayerIntent(f.human, { action: "enroll", sourceSessionKey: "agent:main:player",
    gameId, requestId: "approve" }, f.store), /Approved/);
  assert.match(await runPlayerIntent(f.agent, { action: "join", gameId, requestId: "join" }, f.store), /Joined/);
  const humanMove = { action: "move", target: "tavern", requestId: "move" };
  const agentMove = { action: "move", target: "market", requestId: "move" };
  assert.match(await runPlayerIntent(f.human, humanMove, f.store), /Moved/);
  const result = await runPlayerIntent(f.agent, agentMove, f.store);
  assert.match(result, /Moved/);
  const saved = structuredClone([...f.rows.values()][0]);
  assert.equal(Object.keys(saved.players).length, 2);
  assert.equal(saved.players[JSON.stringify(["human-profile", "erick"])], "tavern");
  assert.equal(saved.players[JSON.stringify(["agent-session", "agent:main:player"])], "market");
  assert.equal(await runPlayerIntent(f.agent, agentMove, f.store), result);
  assert.match(await runPlayerIntent(f.agent, { ...agentMove, target: "tavern" }, f.store), /already used/);
  for (const args of [ { ...agentMove, actor: "erick" }, { ...agentMove, sourceSessionKey: "agent:other:player" },
    { action: "enroll", sourceSessionKey: "agent:other:player", requestId: "bad" } ])
    assert.match(await runPlayerIntent(f.agent, args, f.store), /unavailable/);
  for (const ctx of [ { ...f.agent, inputProvenance: { kind: "internal_system" } },
    { ...f.agent, inputProvenance: { kind: "inter_session", sourceTool: "sessions_send" } },
    { ...f.agent, inputProvenance: { ...f.agent.inputProvenance, sourceSessionKey: "agent:other:player" } },
    { ...f.human, requesterProfile: undefined }, { ...f.human, senderIsOwner: false } ])
    assert.match(await runPlayerIntent(ctx, { ...agentMove, requestId: "bad" }, f.store), /unavailable/);
  assert.deepEqual([...f.rows.values()][0], saved);
});
test("registered V2 intent fixture fences revocation at actual storage effect", async () => {
  const f = intentFixture();
  let descriptor: any;
  let current = true;
  const ctx = { ...f.human, assertInvocationCurrent() { if (!current) throw Error("revoked"); } };
  registerPlayerIntentTool({ registerTool(value: any) { descriptor = value; }, runtime: { state: {
    openKeyedStoreV2(_options: any, authority: any) {
      return { ...f.store, async compareAndApply(...args: any[]) {
        current = false; // Revoke after adapter checks, immediately before actual effect.
        authority.assertCurrent();
        return (f.store.compareAndApply as any)(...args);
      } };
    },
  } } } as any);
  assert.equal(descriptor.contextVersion, 2);
  const tool = descriptor.create(ctx);
  const result = await tool.execute("create", { action: "create", requestId: "start" });
  assert.match(result.content[0].text, /unavailable/);
  assert.equal(f.rows.size, 0);
});

test("attributed agent move accepts matching game and room label, rejects wrong game and actor override", async () => {
  const f = intentFixture();
  await runPlayerIntent(f.human, { action: "create", requestId: "start" }, f.store);
  const gameId = [...f.rows.values()][0].id;
  await runPlayerIntent(f.human, { action: "enroll", sourceSessionKey: "agent:main:player", gameId,
    requestId: "approve" }, f.store);
  await runPlayerIntent(f.agent, { action: "join", gameId, requestId: "join" }, f.store);
  const before = structuredClone([...f.rows.values()][0]);
  assert.match(await runPlayerIntent(f.agent, { action: "look", gameId,
    requestId: "look" }, f.store), /Lantern Quay/);
  for (const wrongId of ["00000000-0000-0000-0000-000000000000", "not-a-uuid"]) {
    assert.match(await runPlayerIntent(f.agent, { action: "move", target: "Beacon Tower", gameId: wrongId,
      requestId: "agent-move" }, f.store), /unavailable/);
    assert.deepEqual([...f.rows.values()][0], before);
  }
  assert.match(await runPlayerIntent(f.agent, { action: "move", target: "Beacon Tower", gameId,
    actor: "erick", requestId: "agent-move" }, f.store), /unavailable/);
  assert.deepEqual([...f.rows.values()][0], before);
  const move = { action: "move", target: "Beacon Tower", gameId, requestId: "agent-move" };
  const receipt = await runPlayerIntent(f.agent, move, f.store);
  assert.match(receipt, /Moved.*Beacon Tower/);
  assert.equal([...f.rows.values()][0].players[JSON.stringify(["human-profile", "erick"])], "quay");
  assert.equal([...f.rows.values()][0].players[JSON.stringify(["agent-session", "agent:main:player"])], "tower");
  assert.equal(await runPlayerIntent(f.agent, move, f.store), receipt);
  assert.equal([...f.rows.values()][0].version, before.version + 1);
});

test("structured GM risk and assistance fields reach authored parser without argument injection", async () => {
  const f = intentFixture();
  await runPlayerIntent(f.human, { action: "create", requestId: "start" }, f.store);
  await runPlayerIntent(f.human, { action: "move", target: "tavern", requestId: "go" }, f.store);
  // Valid syntax must reach the transition's room checks rather than adapter rejection.
  for (const args of [
    { action: "risk", target: "archive-shelf", choice: "wits", retreat: "quay" },
    { action: "risk", target: "archive-shelf", choice: "grit", item: "hand-mirror", retreat: "tavern" },
    { action: "risk", target: "tower-stair", choice: "surge", retreat: "quay" },
    { action: "risk", target: "pump-hatch", choice: "resolve", retreat: "quay" },
    { action: "brace", target: "pump-lever", helper: "safety-line" },
    { action: "open", target: "pump-hatch", helper: "suri" },
  ]) {
    const result = await runPlayerIntent(f.human, { ...args, requestId: "attempt" }, f.store);
    assert.doesNotMatch(result, /unavailable|Usage/);
  }
  const before = structuredClone([...f.rows.values()]);
  for (const args of [
    { action: "risk", target: "archive-shelf", choice: "wits" },
    { action: "risk", target: "tower-stair", choice: "surge", retreat: "archive" },
    { action: "risk", target: "archive-shelf", choice: "wits", retreat: "quay", item: "safety-line" },
    { action: "move", target: "quay", choice: "surge" },
    { action: "open", target: "pump-hatch", helper: "suri other" },
    { action: "brace", target: "pump-lever", helper: "suri" },
  ]) assert.match(await runPlayerIntent(f.human, { ...args, requestId: "bad" }, f.store), /unavailable/);
  assert.deepEqual([...f.rows.values()], before);
});

test("WebChat verified profile required independently of owner and transport sender; replay revalidates", async () => {
  const f = intentFixture();
  const args = { action: "create", target: "quay-runner", requestId: "same-request" };
  for (const requesterProfile of [undefined, { id: "", assertCurrent() {} }, { id: "erick" }]) {
    assert.match(await runPlayerIntent({ ...f.human, requesterSenderId: "gateway-owner", requesterProfile }, args, f.store), /unavailable/);
  }
  assert.equal(f.rows.size, 0);
  let current = true;
  const ctx = { ...f.human, requesterProfile: { id: "verified-profile", assertCurrent() { if (!current) throw Error("profile revoked"); } } };
  const result = await runPlayerIntent(ctx, args, f.store);
  assert.match(result, /Created/);
  assert.equal([...f.rows.values()][0].owner, JSON.stringify(["human-profile", "verified-profile"]));
  assert.equal(await runPlayerIntent(ctx, args, f.store), result);
  current = false;
  await assert.rejects(runPlayerIntent(ctx, args, f.store), /profile revoked/);
  assert.equal([...f.rows.values()][0].version, 1);
  const transport = intentFixture();
  assert.match(await runPlayerIntent({ ...transport.human, requesterProfile: undefined, messageChannel: "discord",
    agentAccountId: "account", requesterSenderId: "transport-user" }, args, transport.store), /Created/);
});

test("profile revocation after awaited read and at final V2 write cannot commit; errors stay private", async () => {
  for (const at of ["read", "write"]) {
    const f = intentFixture();
    let current = true;
    let descriptor: any;
    const ctx = { ...f.human, requesterProfile: { id: "verified-profile", assertCurrent() {
      if (!current) throw Error("PRIVATE_STORAGE_OR_PROFILE_DETAIL");
    } } };
    registerPlayerIntentTool({ registerTool(v: any) { descriptor = v; }, runtime: { state: {
      openKeyedStoreV2(_options: any, authority: any) {
        return { ...f.store, async observe(key: string) {
          const value = await f.store.observe(key);
          if (at === "read") current = false;
          return value;
        }, async compareAndApply(...args: any[]) {
          if (at === "write") current = false;
          authority.assertCurrent();
          return (f.store.compareAndApply as any)(...args);
        } };
      },
    } } } as any);
    const result = await descriptor.create(ctx).execute("create", { action: "create", requestId: "start" });
    assert.match(result.content[0].text, /unavailable/);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STORAGE/);
    assert.equal(f.rows.size, 0);
  }
});
