import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "./engine.ts";
import { rooms, initialWorld, canMove, viewRoom, examine } from "./world.ts";
import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";

function fixture() {
  const rows = new Map<string, any>();
  const revisions = new Map<string, number>();
  const binding = { bindingId: "approved", channel: "chat", accountId: "account", conversationId: "room", threadId: "thread" };
  const store: any = {
    async observe(key: string) { return { value: structuredClone(rows.get(key)), comparison: String(revisions.get(key) ?? 0) }; },
    async compareAndApply(key: string, comparison: string, intent: any) {
      if (comparison !== String(revisions.get(key) ?? 0)) return { status: "conflict", current: await this.observe(key) };
      rows.set(key, structuredClone(intent.value)); revisions.set(key, (revisions.get(key) ?? 0) + 1);
      return { status: "applied" };
    },
  };
  const ctx = (args: string, patch: Record<string, unknown> = {}) => ({
    args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderIsOwner: true, assertOwnerCurrent: () => {},
    getCurrentConversationBinding: async () => binding,
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:room", sessionId: "game-one",
    channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread", ...patch,
  }) as PluginCommandContext;
  const run = (args: string, patch?: Record<string, unknown>) => runCommand(ctx(args, patch), store);
  return { rows, run, store };
}

test("authored six-room graph and conditional archive routes", () => {
  assert.equal(Object.keys(rooms).length, 6);
  const world = initialWorld();
  assert.equal(canMove(world, "quay", "tower"), true);
  assert.equal(canMove(world, "quay", "archive"), false);
  assert.equal(canMove(world, "pump", "archive"), false);
  assert.equal(canMove(world, "tower", "archive"), false);
  world.flags.pumpOpen = true;
  assert.equal(canMove(world, "pump", "archive"), true);
  assert.match(viewRoom(world, "archive", "alice"), /Flooded Archive/);
  assert.equal(examine(world, "quay", "harbor-plan"), null);
  assert.match(examine(world, "archive", "harbor-plan")!, /BALANCE/);
});

test("movement is legal, blocked routes remain blocked, and player-safe views track committed state", async () => {
  const f = fixture();
  assert.match(await f.run("create start"), /Lantern Quay/);
  assert.match(await f.run("move archive illegal"), /blocked or not connected/);
  assert.match(await f.run("move market m1"), /Tide Market/);
  assert.match(await f.run("move pump m2"), /Pump House/);
  assert.match(await f.run("move archive m3"), /blocked or not connected/);
  assert.match(await f.run("open pump-hatch h1"), /Opened pump-hatch/);
  assert.match(await f.run("move archive m3"), /Flooded Archive/);
  assert.match(await f.run("look"), /glass-prism/);
  assert.match(await f.run("examine harbor-plan"), /BALANCE/);
  assert.match(await f.run("recap"), /route to the Archive/);
  assert.doesNotMatch(await f.run("look"), /GM-only|unrevealed ending/);
});

test("unique item pickup and receipt replay cannot claim twice; wrong-room examination is denied", async () => {
  const f = fixture();
  await f.run("create start");
  const first = await f.run("take safety-line item1");
  assert.match(first, /Collected safety-line/);
  assert.equal(await f.run("take safety-line item1"), first);
  assert.match(await f.run("take safety-line item2"), /not available/);
  assert.match(await f.run("inventory"), /safety-line/);
  assert.match(await f.run("examine hand-mirror"), /Nothing relevant/);
  assert.match(await f.run("move tavern move1"), /Crooked Compass/);
  assert.match(await f.run("examine hand-mirror"), /hand-mirror/);
  assert.match(await f.run("take hand-mirror item3"), /Collected/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.items["hand-mirror"], saved.owner);
  assert.equal(saved.inventory[saved.owner].filter((item: string) => item === "hand-mirror").length, 1);
});

test("CAS race for one item yields one accepted receipt and no lost update", async () => {
  const f = fixture();
  await f.run("create start");
  const [a, b] = await Promise.all([f.run("take safety-line race-a"), f.run("take safety-line race-b")]);
  assert.equal([a, b].filter((result) => result.startsWith("Collected")).length, 1);
  assert.equal([a, b].filter((result) => result.includes("not available")).length, 1);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.inventory[saved.owner].length, 1);
  assert.equal(saved.world.journal.length, 1);
});
