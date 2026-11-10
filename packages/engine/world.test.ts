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
  const run = (args: string, patch?: Record<string, unknown>, die?: () => number) => runCommand(ctx(args, patch), store, die);
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

test("Suri offers help in the Market and opens the hatch with the player at the Pump", async () => {
  const f = fixture();
  const noRoll = () => { throw new Error("unexpected dice"); };
  await f.run("create start");
  await f.run("move market market");
  await f.run("examine gauge-slate slate");
  assert.match(await f.run("open pump-hatch suri early", undefined, noRoll), /not here/);
  await f.run("move pump pump");
  assert.match(await f.run("open pump-hatch suri early", undefined, noRoll), /Talk to Suri/);
  await f.run("move market return");
  assert.match(await f.run("talk suri talk"), /help at the Pump House/);
  await f.run("move pump back");
  const before = [...f.rows.values()][0];
  const opened = await f.run("open pump-hatch suri help", undefined, noRoll);
  assert.match(opened, /Suri holds the lever.*opened pump-hatch/i);
  const after = [...f.rows.values()][0];
  assert.equal(after.version, before.version + 1);
  assert.equal(after.world.flags.pumpOpen, true);
  assert.equal(after.world.flags.pumpBraced, false);
  assert.equal(after.world.surge, before.world.surge);
  assert.deepEqual(after.resolve, before.resolve);
  assert.deepEqual(after.world.journal.slice(before.world.journal.length), ["Suri held the lever while the player opened the Pump hatch."]);
  const receipt = after.receipts[JSON.stringify([after.owner, "help"])];
  assert.equal(receipt.text, opened);
  assert.equal(receipt.roll, undefined);
  assert.match(await f.run("open pump-hatch help"), /already used/);
  assert.match(await f.run("open pump-hatch again"), /already open/);
  assert.match(await f.run("risk pump-hatch surge quay again", undefined, noRoll), /already open/);
  assert.match(await f.run("move archive enter"), /Flooded Archive/);
  assert.equal(await f.run("open pump-hatch suri help", undefined, noRoll), opened);
  assert.match(await f.run("move pump back-through-hatch"), /Pump House/);
});

async function pumpFixture() {
  const f = fixture();
  await f.run("create start");
  await f.run("examine cleat cleat");
  await f.run("take safety-line line");
  await f.run("move market market");
  await f.run("talk suri talk");
  await f.run("move pump pump");
  return f;
}

for (const scenario of [
  { name: "10+ clean", dice: [4, 5], choice: "resolve", band: "clean", surge: 0, resolve: 6, effect: /opens cleanly/ },
  { name: "7–9 with Resolve cost", dice: [3, 3], choice: "resolve", band: "cost", surge: 0, resolve: 5, effect: /opens.*costs 1 Resolve/ },
  { name: "7–9 with surge cost", dice: [4, 4], choice: "surge", band: "cost", surge: 1, resolve: 6, effect: /opens.*surge rises/ },
  { name: "7–9 at surge cap", dice: [3, 4], choice: "surge", band: "cost", initialSurge: 2, surge: 2, resolve: 5, effect: /opens.*costs 1 Resolve/ },
  { name: "6− jammed open", dice: [2, 3], choice: "resolve", band: "complication", initialSurge: 1, surge: 2, resolve: 6, effect: /jams open.*surge rises/ },
  { name: "6− capped surge and zero Resolve", dice: [1, 1], choice: "surge", band: "complication", initialSurge: 2, initialResolve: 1, surge: 2, resolve: 0, effect: /jams open.*costs 1 Resolve/ },
]) {
  test(`rushed Pump hatch commits ${scenario.name} in one replayable effect`, async () => {
    const f = await pumpFixture();
    const before = [...f.rows.values()][0];
    before.world.surge = scenario.initialSurge ?? 0;
    before.resolve[before.owner] = scenario.initialResolve ?? 6;
    const command = `risk pump-hatch ${scenario.choice} tavern rush`;
    let draws = 0;
    const opened = await f.run(command, undefined, () => scenario.dice[draws++]);
    assert.equal(draws, 2);
    assert.match(opened, scenario.effect);
    const after = [...f.rows.values()][0];
    assert.equal(after.version, before.version + 1);
    assert.equal(after.world.flags.pumpOpen, true);
    assert.equal(after.world.flags.pumpBraced, false);
    assert.equal(after.world.surge, scenario.surge);
    assert.equal(after.resolve[after.owner], scenario.resolve);
    assert.deepEqual(after.inventory, before.inventory);
    assert.deepEqual(after.world.clues, before.world.clues);
    const entries = after.world.journal.slice(before.world.journal.length);
    assert.equal(entries.length, 1);
    assert.match(entries[0], scenario.effect);
    const receipt = after.receipts[JSON.stringify([after.owner, "rush"])];
    assert.equal(receipt.text, opened);
    const [first, second] = scenario.dice;
    assert.deepEqual(receipt.roll, { dice: scenario.dice, attribute: "grit", modifier: 1, total: first + second + 1, band: scenario.band });
    assert.equal(await f.run(command, undefined, () => { throw new Error("reroll"); }), opened);
    assert.match(await f.run(`risk pump-hatch ${scenario.choice} quay rush`), /already used/);
    const otherCost = scenario.choice === "surge" ? "resolve" : "surge";
    assert.match(await f.run(`risk pump-hatch ${otherCost} tavern rush`), /already used/);
    assert.equal([...f.rows.values()][0].version, after.version);
    if (scenario.resolve === 0) {
      assert.match(opened, /Retreat to the Crooked Compass/);
      assert.equal(after.players[after.owner], "tavern");
      assert.match(await f.run("rest breather"), /Recovered to 2 Resolve/);
      await f.run("move market return");
      await f.run("move pump back");
    } else {
      assert.equal(after.players[after.owner], "pump");
    }
    assert.match(await f.run("move archive enter"), /Flooded Archive/);
  });
}

test("a rushed Pump hatch requires a present player and an unbraced hatch", async () => {
  const f = fixture();
  const noRoll = () => { throw new Error("unexpected dice"); };
  await f.run("create start");
  assert.match(await f.run("risk pump-hatch resolve quay rush", undefined, noRoll), /not here/);
  await f.run("move market market");
  await f.run("take weather-crate crate");
  await f.run("move pump pump");
  await f.run("brace pump-lever brace");
  assert.match(await f.run("risk pump-hatch resolve quay rush", undefined, noRoll), /already braced/);
  assert.match(await f.run("open pump-hatch rush"), /Opened pump-hatch/);
});

test("a conflicting hatch opening leaves exactly one journal effect and receipt", async () => {
  const f = await pumpFixture();
  const before = [...f.rows.values()][0];
  const apply = f.store.compareAndApply.bind(f.store);
  const attempts: string[] = [];
  f.store.compareAndApply = async (...args: any[]) => {
    const result = await apply(...args);
    attempts.push(result.status);
    return result;
  };
  const [rushed, assisted] = await Promise.all([
    f.run("risk pump-hatch surge quay rush", undefined, () => 1),
    f.run("open pump-hatch suri help"),
  ]);
  assert.deepEqual(attempts.sort(), ["applied", "conflict"]);
  const after = [...f.rows.values()][0];
  assert.equal(after.version, before.version + 1);
  assert.equal(after.world.journal.length, before.world.journal.length + 1);
  assert.equal(after.world.flags.pumpOpen, true);
  if (Object.hasOwn(after.receipts, JSON.stringify([after.owner, "rush"]))) {
    assert.match(rushed, /jams open/);
    assert.match(assisted, /already open/);
    assert.equal(after.world.surge, 1);
  } else {
    assert.match(assisted, /Suri holds/);
    assert.match(rushed, /already open/);
    assert.equal(after.world.surge, 0);
  }
});

test("a Pump CAS retry keeps its dice and resolves the cost against fresh state", async () => {
  const f = await pumpFixture();
  const before = [...f.rows.values()][0];
  before.world.surge = 1;
  const apply = f.store.compareAndApply.bind(f.store);
  let conflict = false;
  f.store.compareAndApply = async (key: string, comparison: string, intent: any) => {
    if (!conflict) {
      conflict = true;
      const concurrent = structuredClone(before);
      concurrent.world.surge = 2;
      assert.equal((await apply(key, comparison, { ...intent, value: concurrent })).status, "applied");
    }
    return apply(key, comparison, intent);
  };
  let draws = 0;
  const opened = await f.run("risk pump-hatch surge quay rush", undefined, () => { draws++; return 1; });
  assert.match(opened, /jams open.*costs 1 Resolve/);
  assert.equal(draws, 2);
  const after = [...f.rows.values()][0];
  assert.equal(after.world.surge, 2);
  assert.equal(after.resolve[after.owner], 5);
  assert.equal(after.world.journal.length, before.world.journal.length + 1);
});

test("a lost Pump reply replays the real engine roll and its saved effect", async () => {
  const f = await pumpFixture();
  const before = [...f.rows.values()][0];
  const apply = f.store.compareAndApply.bind(f.store);
  f.store.compareAndApply = async (...args: any[]) => {
    assert.equal((await apply(...args)).status, "applied");
    throw new Error("reply lost after commit");
  };
  const command = "risk pump-hatch resolve quay lost";
  await assert.rejects(() => f.run(command), /reply lost after commit/);
  const after = [...f.rows.values()][0];
  const { roll, text } = after.receipts[JSON.stringify([after.owner, "lost"])];
  const [first, second] = roll.dice;
  assert.ok([first, second].every((die) => Number.isInteger(die) && die >= 1 && die <= 6));
  assert.equal(roll.total, first + second + 1);
  assert.equal(after.world.flags.pumpOpen, true);
  assert.equal(after.world.journal.length, before.world.journal.length + 1);
  assert.equal(after.version, before.version + 1);
  assert.equal(await f.run(command, undefined, () => { throw new Error("reroll"); }), text);
  assert.deepEqual([...f.rows.values()][0], after);
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

test("mixed Archive shelf result can leave a carried nonessential item, preserving Resolve and replay", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("move market market");
  await f.run("take colored-twine twine");
  await f.run("move quay quay");
  await f.run("move tower tower");
  await f.run("open tower-stair stair");
  await f.run("move archive archive");
  let draws = 0;
  const command = "risk archive-shelf grit colored-twine tavern shelf";
  const result = await f.run(command, undefined, () => { draws++; return 3; });
  assert.match(result, /cost.*colored-twine is left on the Archive shelf/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.items["colored-twine"], "archive");
  assert.equal(saved.inventory[saved.owner].includes("colored-twine"), false);
  assert.equal(saved.resolve[saved.owner], 6);
  assert.equal(saved.world.flags.archiveShelfSettled, true);
  assert.equal(saved.world.journal.filter((entry: string) => entry.includes("colored-twine is left")).length, 1);
  assert.equal(draws, 2);
  assert.equal(await f.run(command, undefined, () => { throw Error("rerolled"); }), result);
  assert.match(await f.run("risk archive-shelf grit tavern shelf"), /already used/);
  assert.match(await f.run("take colored-twine retrieve"), /Collected colored-twine/);
});

test("Archive shelf item choice rejects absent and essential gear before rolling", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("move tower tower");
  await f.run("open tower-stair stair");
  await f.run("move archive archive");
  const noRoll = () => { throw Error("unexpected roll"); };
  assert.match(await f.run("risk archive-shelf grit hand-mirror quay absent", undefined, noRoll), /Carry the chosen item/);
  assert.match(await f.run("risk archive-shelf grit safety-line quay essential", undefined, noRoll), /Usage:/);
  assert.match(await f.run("risk archive-shelf grit quay ordinary", undefined, () => 3), /costs 1 Resolve/);
});

test("Archive item choice on a clean result does not leave the item", async () => {
  const f = fixture();
  await f.run("create start");
  await f.run("move market market");
  await f.run("take colored-twine twine");
  await f.run("move quay quay");
  await f.run("move tower tower");
  await f.run("open tower-stair stair");
  await f.run("move archive archive");
  assert.match(await f.run("risk archive-shelf wits colored-twine quay shelf", undefined, () => 6), /clean.*saved cleanly/);
  const saved = [...f.rows.values()][0];
  assert.equal(saved.world.items["colored-twine"], saved.owner);
  assert.equal(saved.inventory[saved.owner].includes("colored-twine"), true);
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
