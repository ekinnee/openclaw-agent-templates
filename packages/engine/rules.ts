// Original Lantern rules. Roll results are data to commit with the same action receipt.
// This module never decides a player's action or narrates an uncommitted outcome.
import { randomInt } from "node:crypto";
export type Attribute = "grit" | "wits" | "charm";
export type Attributes = Record<Attribute, 0 | 1 | 2>;
export type Roll = { dice: [number, number]; attribute: Attribute; modifier: number; total: number;
  band: "clean" | "cost" | "complication" };
export function validAttributes(value: unknown): value is Attributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 3 && [v.grit, v.wits, v.charm].sort().join(",") === "0,1,2";
}
export function roll(attribute: Attribute, attributes: Attributes, die: () => number = () => randomInt(1, 7)): Roll {
  if (!validAttributes(attributes)) throw new Error("Invalid character attributes");
  const first = die(); const second = die();
  if (![first, second].every((n) => Number.isInteger(n) && n >= 1 && n <= 6)) throw new Error("Invalid die");
  const total = first + second + attributes[attribute];
  return { dice: [first, second], attribute, modifier: attributes[attribute], total,
    band: total >= 10 ? "clean" : total >= 7 ? "cost" : "complication" };
}
export function applyResolve(current: number, cost: number): { resolve: number; retreat: boolean } {
  if (!Number.isInteger(current) || current < 0 || current > 6 || !Number.isInteger(cost) || cost < 0) throw new Error("Invalid Resolve");
  const resolve = Math.max(0, current - cost);
  return { resolve, retreat: resolve === 0 };
}
