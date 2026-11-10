import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand, registerEngine } from "./engine.ts";
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
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:chat:room",
    channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread", ...patch,
  }) as PluginCommandContext;
  return { rows, revisions, store, context, binding, setBinding: (v: any) => { currentBinding = v; }, revoke: () => { ownerCurrent = false; } };
}

test("owner authority and approved destination are mandatory", async () => {
  const f = fixture();
  for (const patch of [
    { isAuthorizedSender: false }, { senderIsOwner: false }, { assertOwnerCurrent: undefined },
    { senderId: undefined }, { agentId: undefined }, { sessionKey: undefined },
    { accountId: undefined }, { from: undefined }, { to: undefined },
    { messageThreadId: undefined }, { getCurrentConversationBinding: undefined },
  ]) assert.match(await runCommand(f.context("create req1", patch), f.store), /unavailable/);
  f.setBinding(null);
  assert.match(await runCommand(f.context("create req1"), f.store), /unavailable/);
  f.setBinding(f.binding);
  assert.match(await runCommand(f.context("create req1"), f.store), /Created game/);
  assert.equal(f.rows.size, 1);
  for (const patch of [{ agentId: "other" }, { sessionKey: "other" }, { channel: "other" },
    { accountId: "other" }, { messageThreadId: "other" }, { threadParentId: "other" },
    { from: "other" }, { to: "other" }])
    assert.match(await runCommand(f.context("look", patch), f.store), /unavailable/);
  f.setBinding({ ...f.binding, bindingId: "approved-2" });
  assert.match(await runCommand(f.context("look"), f.store), /unavailable/);
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
  for (let n = 0; n < 63; n++) game.receipts[`receipt-${n}`] = { fingerprint: "test", text: "test" };
  assert.match(await runCommand(f.context("move market over-cap"), f.store), /capacity/);
  assert.equal(f.rows.get(key).version, 1);
  assert.match(await runCommand(f.context("look"), { observe: f.store.observe } as Store), /unavailable/);
  game.receipts = {};
  game.receipts.huge = { fingerprint: "test", text: "x".repeat(65536) };
  assert.match(await runCommand(f.context("move market bytes"), f.store), /capacity/);
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
