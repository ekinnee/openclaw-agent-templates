import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand, registerEngine } from "./engine.ts";
import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";

type Store = PluginStateKeyedStore<any, 2>;
function fixture() {
  const rows = new Map<string, any>();
  const revisions = new Map<string, number>();
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
    args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderId: "alice",
    agentId: "keeper", sessionKey: "agent:keeper:chat:room", channel: "chat", accountId: "account",
    messageThreadId: "thread", ...patch,
  }) as PluginCommandContext;
  return { rows, revisions, store, context };
}

test("authorization and exact conversation binding fail closed", async () => {
  const f = fixture();
  assert.match(await runCommand(f.context("create req1", { isAuthorizedSender: false }), f.store), /unavailable/);
  assert.match(await runCommand(f.context("create req1", { senderId: undefined }), f.store), /unavailable/);
  assert.match(await runCommand(f.context("create req1", { agentId: undefined }), f.store), /unavailable/);
  assert.match(await runCommand(f.context("create req1", { sessionKey: undefined }), f.store), /unavailable/);
  assert.equal(f.rows.size, 0);
  const created = await runCommand(f.context("create req1"), f.store);
  assert.match(created, /Created game/);
  for (const patch of [
    { agentId: "other" }, { sessionKey: "other" }, { channel: "other" },
    { accountId: "other" }, { messageThreadId: "other" }, { threadParentId: "other" },
  ]) assert.match(await runCommand(f.context("look", patch), f.store), /unavailable/);
  assert.equal(f.rows.size, 1);
});

test("create, join, look and move have stable scoped receipts", async () => {
  const f = fixture();
  const alice = f.context("create request1");
  const created = await runCommand(alice, f.store);
  const gameId = created.match(/Created game ([0-9a-f-]{36})/)?.[1];
  assert.ok(gameId);
  assert.equal(await runCommand(alice, f.store), created);
  assert.match(await runCommand(f.context("move market request1"), f.store), /already used/);
  const bob = { senderId: "bob" };
  assert.match(await runCommand(f.context("look", bob), f.store), /unavailable/);
  assert.match(await runCommand(f.context("join 00000000-0000-0000-0000-000000000000 join1", bob), f.store), /unavailable/);
  const joined = await runCommand(f.context(`join ${gameId} join1`, bob), f.store);
  assert.match(joined, /Joined game/);
  assert.equal(await runCommand(f.context(`join ${gameId} join1`, bob), f.store), joined);
  const moved = await runCommand(f.context("move market move1", bob), f.store);
  assert.match(moved, /Tide Market/);
  assert.equal(await runCommand(f.context("move market move1", bob), f.store), moved);
  assert.match(await runCommand(f.context("look", bob), f.store), /Tide Market/);
  assert.match(await runCommand(f.context("look"), f.store), /Lantern Quay/);
  const samePlace = await runCommand(f.context("move market samePlace", bob), f.store);
  assert.match(samePlace, /Already there/);
  assert.equal(await runCommand(f.context("move market samePlace", bob), f.store), samePlace);
});

test("CAS conflicts reread receipts; exhaustion fails safely", async () => {
  const f = fixture();
  let conflict = true;
  const original = f.store.compareAndApply!.bind(f.store);
  f.store.compareAndApply = async (key, comparison, intent) => {
    if (conflict) { conflict = false; return { status: "conflict", current: await f.store.observe!(key) }; }
    return original(key, comparison, intent);
  };
  assert.match(await runCommand(f.context("create retry"), f.store), /Created game/);
  assert.equal(f.rows.size, 1);
  const broken = { observe: f.store.observe, compareAndApply: async () => ({ status: "conflict", current: { value: undefined, comparison: "0" } }) } as Store;
  assert.match(await runCommand(f.context("create new" , { sessionKey: "new" }), broken), /concurrent update/);
});

test("capacity and missing V2 CAS refuse mutation", async () => {
  const f = fixture();
  await runCommand(f.context("create first"), f.store);
  const key = [...f.rows.keys()][0];
  const game = f.rows.get(key);
  for (let n = 0; n < 255; n++) game.receipts[`receipt-${n}`] = { fingerprint: "test", text: "test" };
  const version = game.version;
  assert.match(await runCommand(f.context("move market over-cap"), f.store), /capacity/);
  assert.equal(f.rows.get(key).version, version);
  assert.match(await runCommand(f.context("look"), { observe: f.store.observe } as Store), /unavailable/);
});

test("registration requires auth and state opener errors fail closed", async () => {
  let definition: any;
  registerEngine({
    registerCommand: (command: any) => { definition = command; },
    runtime: { state: { openKeyedStoreV2: () => { throw Error("secret state path"); } } },
  } as any);
  assert.equal(definition.name, "ck");
  assert.equal(definition.requireAuth, true);
  assert.match((await definition.handler(fixture().context("create req"))).text, /unavailable/);
});
