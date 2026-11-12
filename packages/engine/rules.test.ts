import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResolve, roll, validAttributes } from "./rules.ts";

const attributes = { grit: 2, wits: 1, charm: 0 } as const;
test("original 2d6 bands use actual generated dice and a single attribute", () => {
  assert.equal(validAttributes(attributes), true);
  assert.equal(validAttributes({ grit: 2, wits: 2, charm: 0 }), false);
  assert.equal(validAttributes({ grit: "0", wits: "1", charm: "2" }), false);
  assert.throws(() => roll("charm", { grit: "0", wits: "1", charm: "2" } as any, () => 1), /Invalid character attributes/);
  const dice = [6, 2, 3, 2, 1, 1];
  const die = () => dice.shift()!;
  assert.deepEqual(roll("grit", attributes, die), { dice: [6, 2], attribute: "grit", modifier: 2, total: 10, band: "clean" });
  assert.equal(roll("grit", attributes, die).band, "cost");
  assert.equal(roll("charm", attributes, die).band, "complication");
  assert.equal(dice.length, 0);
  assert.throws(() => roll("wits", attributes, () => 0), /Invalid die/);
});
test("Resolve is bounded strain and zero triggers nonlethal retreat", () => {
  assert.deepEqual(applyResolve(6, 1), { resolve: 5, retreat: false });
  assert.deepEqual(applyResolve(1, 2), { resolve: 0, retreat: true });
  assert.throws(() => applyResolve(-1, 1), /Invalid Resolve/);
});
