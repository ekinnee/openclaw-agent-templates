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
  assert.match(await f.run("take weather-crate crate1"), /Collected weather-crate/);
  assert.match(await f.run("move pump m2"), /Pump House/);
  assert.match(await f.run("move archive m3"), /blocked or not connected/);
  assert.match(await f.run("open pump-hatch premature"), /must be held or braced/);
  assert.match(await f.run("brace pump-lever brace1"), /Braced/);
  assert.equal(await f.run("brace pump-lever brace1"), "Braced the pump lever. Version 5.");
  assert.match(await f.run("open pump-hatch h1"), /Opened pump-hatch/);
  assert.match(await f.run("move archive m3"), /Flooded Archive/);
  assert.match(await f.run("look"), /glass-prism/);
  assert.match(await f.run("examine harbor-plan clue1"), /BALANCE/);
  assert.match(await f.run("recap"), /route to the Archive/);
  assert.doesNotMatch(await f.run("look"), /GM-only|unrevealed ending/);
});

test("Pump brace requires the uniquely tracked Market crate", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("move market m1");
  await f.run("move pump m2");
  assert.match(await f.run("brace pump-lever premature"), /Bring the weather crate/);
  assert.match(await f.run("open pump-hatch premature"), /must be held or braced/);
  await f.run("move market back");
  assert.match(await f.run("take weather-crate crate"), /Collected/);
  await f.run("move pump return");
  assert.match(await f.run("brace pump-lever brace"), /Braced/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.items["weather-crate"], saved.owner);
  assert.equal(saved.inventory[saved.owner].filter((item: string) => item === "weather-crate").length, 1);
});

test("unique item pickup and receipt replay cannot claim twice; wrong-room examination is denied", async () => {
  const f = fixture();
  await f.run("create start");
  assert.match(await f.run("take safety-line premature"), /not been discovered/);
  assert.match(await f.run("examine safety-line hidden"), /Nothing relevant/);
  assert.match(await f.run("examine cleat clue1"), /safety-line/);
  const first = await f.run("take safety-line item1");
  assert.match(first, /Collected safety-line/);
  assert.equal(await f.run("take safety-line item1"), first);
  assert.match(await f.run("take safety-line item2"), /not available/);
  assert.match(await f.run("inventory"), /safety-line/);
  assert.match(await f.run("examine hand-mirror examine1"), /Nothing relevant/);
  assert.match(await f.run("move tavern move1"), /Crooked Compass/);
  assert.match(await f.run("examine hand-mirror examine2"), /hand-mirror/);
  assert.match(await f.run("take hand-mirror item3"), /Collected/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.items["hand-mirror"], saved.owner);
  assert.equal(saved.inventory[saved.owner].filter((item: string) => item === "hand-mirror").length, 1);
});

test("CAS race for one item yields one accepted receipt and no lost update", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("examine cleat clue1");
  const [a, b] = await Promise.all([f.run("take safety-line race-a"), f.run("take safety-line race-b")]);
  assert.equal([a, b].filter((result) => result.startsWith("Collected")).length, 1);
  assert.equal([a, b].filter((result) => result.includes("not available")).length, 1);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.inventory[saved.owner].length, 1);
  assert.equal(saved.world.journal.length, 2); // examination and the one accepted pickup
});

test("a committed roll replays exactly without calling randomness again", async () => {
  const f = fixture();
  await f.run("create start");
  const ctx = (args: string) => ({
    args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderIsOwner: true, assertOwnerCurrent: () => {},
    getCurrentConversationBinding: async () => ({ bindingId: "approved", channel: "chat", accountId: "account", conversationId: "room", threadId: "thread" }),
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:room", sessionId: "game-one",
    channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread",
  }) as PluginCommandContext;
  let calls = 0;
  const first = await runCommand(ctx("roll wits risky"), f.store, () => { calls++; return 3; });
  assert.match(first, /3\+3 \+ 2 wits = 8: cost/);
  assert.equal(await runCommand(ctx("roll wits risky"), f.store, () => { throw Error("rerolled"); }), first);
  assert.equal(calls, 2);
  assert.match(await runCommand(ctx("roll grit risky"), f.store), /already used/);
  const saved = [...f.rows.values()][0];
  assert.deepEqual(saved.receipts[JSON.stringify([saved.owner, "risky"])].roll.dice, [3, 3]);
});

test("ending is an explicit committed choice, cannot be rewritten, and updates aggregate status", async () => {
  const f = fixture();
  await f.run("create start");
  assert.match(await f.run("finish balanced uninformed"), /Learn the consequences/);
  assert.match(await f.run("talk mara stakes"), /DIVERT spares the Quay/);
  assert.match(await f.run("finish balanced early"), /Beacon Tower/);
  assert.match(await f.run("move tower travel"), /Beacon Tower/);
  assert.match(await f.run("finish balanced no-reflector"), /Fit a reflector/);
  assert.match(await f.run("fit improvised lens"), /Fitted improvised/);
  const ending = await f.run("finish balanced final");
  assert.match(ending, /Committed balanced ending/);
  assert.equal(await f.run("finish balanced final"), ending);
  assert.match(await f.run("finish diverted changed"), /committed ending/);
  assert.match(await f.run("recap"), /Ending: balanced/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.ending, "balanced");
  assert.equal(saved.world.journal.filter((event: string) => event.includes("chose the balanced ending")).length, 1);
  assert.equal(saved.world.dial, "balanced");
  assert.equal(saved.world.beacon, "lit");
});

test("deferred and shuttered endings require prior warning, while diversion commits its stated cost", async () => {
  const deferred = fixture();
  await deferred.run("create start");
  assert.match(await deferred.run("finish deferred uninformed"), /Learn the consequences/);
  await deferred.run("talk mara stakes");
  assert.match(await deferred.run("finish deferred premature"), /evacuation/);
  await deferred.run("warn evacuate warn1");
  assert.match(await deferred.run("finish deferred finish1"), /Residents have been warned and evacuated/);
  const deferredSave = [...deferred.rows.values()][0];
  assert.equal(deferredSave.world.beacon, "dark");
  assert.equal(deferredSave.world.ending, "deferred");

  const shuttered = fixture();
  await shuttered.run("create start");
  await shuttered.run("talk mara stakes");
  await shuttered.run("move tower travel");
  assert.match(await shuttered.run("finish shuttered premature"), /Warn the boats/);
  await shuttered.run("warn boats warn1");
  assert.match(await shuttered.run("finish shuttered final"), /warned boats take shelter/);
  assert.equal([...shuttered.rows.values()][0].world.dial, "shut");

  const diverted = fixture();
  await diverted.run("create start");
  await diverted.run("move tower travel");
  assert.match(await diverted.run("finish diverted uninformed"), /Learn the consequences/);
  assert.match(await diverted.run("examine dial insufficient"), /marked/);
  assert.match(await diverted.run("finish diverted still-uninformed"), /Learn the consequences/);
  await diverted.run("talk mara stakes");
  assert.match(await diverted.run("fit improvised lens"), /Fitted improvised/);
  assert.match(await diverted.run("finish diverted final"), /lost stock/);
  assert.equal([...diverted.rows.values()][0].world.beacon, "lit");
});

test("real reflector must be in the actor inventory; improvised route stays available", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("move tower go1");
  assert.match(await f.run("fit glass-prism absent"), /do not carry/);
  assert.match(await f.run("fit improvised uninformed"), /Ask Mara/);
  await f.run("talk mara stakes");
  assert.match(await f.run("fit improvised fitted"), /Fitted improvised/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.reflector, "improvised");
  assert.equal(await f.run("fit improvised fitted"), saved.receipts[JSON.stringify([saved.owner, "fitted"])].text);
  assert.match(await f.run("fit glass-prism second"), /already has/);
});

test("a committed write with a lost reply reconciles by the same request ID without a second effect", async () => {
  const f = fixture();
  await f.run("create start");
  const original = f.store.compareAndApply.bind(f.store);
  let lost = true;
  f.store.compareAndApply = async (...args: any[]) => {
    const applied = await original(...args);
    if (lost && applied.status === "applied") { lost = false; throw Error("reply lost after commit"); }
    return applied;
  };
  await assert.rejects(() => f.run("move market uncertain"), /reply lost after commit/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.version, 2);
  const retry = await f.run("move market uncertain");
  assert.match(retry, /Moved.*Tide Market/);
  assert.equal([...f.rows.values()][0].version, 2);
  assert.match(await f.run("take safety-line uncertain"), /already used/);
});

test("NPCs and clue routes require room presence and persist facts before finale", async () => {
  const f = fixture();
  await f.run("create start");
  assert.match(await f.run("talk suri wrong"), /not here/);
  await f.run("move tavern go1");
  const pell = await f.run("talk pell talk1");
  assert.match(pell, /balance the harbor pressure/);
  assert.equal(await f.run("talk pell talk1"), pell);
  let saved = [...f.rows.values()][0];
  assert.equal(saved.world.clues.plateRead, true);
  assert.equal(saved.world.clues.balanceKnown, true);
  await f.run("move market go2");
  assert.match(await f.run("examine gauge-slate clue2"), /middle setting/);
  assert.match(await f.run("talk suri talk2"), /middle BALANCE/);
  assert.match(await f.run("take weather-crate crate1"), /Collected weather-crate/);
  saved = [...f.rows.values()][0];
  assert.equal(saved.world.clues.marketPatternHeard, true);
  await f.run("move pump go3");
  await f.run("brace pump-lever brace1");
  await f.run("open pump-hatch hatch1");
  await f.run("move archive go4");
  assert.match(await f.run("examine harbor-plan clue3"), /pressure clutch slipped/);
  saved = [...f.rows.values()][0];
  assert.equal(saved.world.clues.archivePlanRead, true);
  assert.match(await f.run("talk mara wrong2"), /not here/);
});

test("optional Archive shelf check commits dice and cost together, and replays once", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("move tower go1");
  await f.run("open tower-stair stair1");
  await f.run("move archive go2");
  const context = (args: string) => ({
    args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderIsOwner: true, assertOwnerCurrent: () => {},
    getCurrentConversationBinding: async () => ({ bindingId: "approved", channel: "chat", accountId: "account", conversationId: "room", threadId: "thread" }),
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:room", sessionId: "game-one",
    channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread",
  }) as PluginCommandContext;
  let calls = 0;
  const rolled = await runCommand(context("risk archive-shelf grit tavern shelf1"), f.store, () => { calls++; return 3; });
  assert.match(rolled, /3\+3 \+ 1 grit = 7: cost.*costs 1 Resolve/);
  assert.equal(calls, 2);
  assert.equal(await runCommand(context("risk archive-shelf grit tavern shelf1"), f.store, () => { throw Error("reroll"); }), rolled);
  assert.match(await f.run("risk archive-shelf grit tavern shelf2"), /already settled/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.resolve[saved.owner], 5);
  assert.equal(saved.world.flags.archiveShelfSettled, true);
  assert.equal(saved.world.surge, 0);
  assert.match(await f.run("move tower go3"), /Beacon Tower/);
  assert.match(await f.run("rest not-in-tavern"), /Crooked Compass/);
  await f.run("move quay go4");
  await f.run("move tavern go5");
  assert.match(await f.run("rest recover"), /Recovered to 6 Resolve/);
});

test("failed Archive shelf check reveals route and advances capped surge", async () => {
  const f = fixture();
  await f.run("create start"); await f.run("move tower go1"); await f.run("open tower-stair stair1"); await f.run("move archive go2");
  const context = (args: string) => ({ args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderIsOwner: true,
    assertOwnerCurrent: () => {}, getCurrentConversationBinding: async () => ({ bindingId: "approved", channel: "chat", accountId: "account", conversationId: "room", threadId: "thread" }),
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:room", sessionId: "game-one", channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread" }) as PluginCommandContext;
  const result = await runCommand(context("risk archive-shelf wits quay shelf1"), f.store, () => 1);
  assert.match(result, /complication.*maintenance route/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.surge, 1);
  assert.equal(saved.world.flags.archiveShelfSettled, true);
  assert.match(await f.run("examine harbor-plan clue1"), /BALANCE/);
});

test("zero-Resolve Archive cost respects selected retreat room and breather", async () => {
  const f = fixture();
  await f.run("create start"); await f.run("move tower go1"); await f.run("open tower-stair stair1"); await f.run("move archive go2");
  const saved = [...f.rows.values()][0];
  saved.resolve[saved.owner] = 1;
  const ctx = (args: string) => ({ args, commandBody: `/ck ${args}`, isAuthorizedSender: true, senderIsOwner: true,
    assertOwnerCurrent: () => {}, getCurrentConversationBinding: async () => ({ bindingId: "approved", channel: "chat", accountId: "account", conversationId: "room", threadId: "thread" }),
    senderId: "alice", agentId: "keeper", sessionKey: "agent:keeper:room", sessionId: "game-one", channel: "chat", accountId: "account", from: "chat:room", to: "chat:room", messageThreadId: "thread" }) as PluginCommandContext;
  const result = await runCommand(ctx("risk archive-shelf grit tavern shelf1"), f.store, () => 3);
  assert.match(result, /Retreat to the Crooked Compass/);
  const after = [...f.rows.values()][0];
  assert.equal(after.players[after.owner], "tavern");
  assert.equal(after.resolve[after.owner], 0);
  assert.match(await f.run("rest breather"), /Recovered to 2 Resolve/);
  assert.equal([...f.rows.values()][0].rests[after.owner].before, false);
});
