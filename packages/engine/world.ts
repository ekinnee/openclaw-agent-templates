// Authored Lantern Below world data and deterministic player-safe projections.
// GM-only explanations remain in the Template; this module contains no secret solutions.
export const rooms = {
  quay: { name: "Lantern Quay", text: "The beacon is dark. Three uneven bell notes travel through the harbor planks.", exits: { tavern: "tavern", market: "market", tower: "tower" }, objects: ["safety-line"] },
  tavern: { name: "Crooked Compass", text: "Warm windows and old harbor charts surround Pell's table.", exits: { quay: "quay", market: "market" }, objects: ["hand-mirror"] },
  market: { name: "Tide Market", text: "Suri watches water pulse between the market stalls.", exits: { quay: "quay", tavern: "tavern", pump: "pump" }, objects: [] },
  pump: { name: "Pump House", text: "A lever and wheel face one another across a vibrating channel.", exits: { market: "market", archive: "archive" }, objects: [] },
  archive: { name: "Flooded Archive", text: "Shelves rise above shallow water and a brass harbor plan.", exits: { pump: "pump", tower: "tower" }, objects: ["glass-prism"] },
  tower: { name: "Beacon Tower", text: "A cold lantern stands by a dial and a bolted service stair.", exits: { quay: "quay", archive: "archive" }, objects: [] },
} as const;
export type RoomId = keyof typeof rooms;
export type ItemId = "safety-line" | "hand-mirror" | "glass-prism";
export type ClueId = "plateRead" | "marketPatternHeard" | "archivePlanRead" | "balanceKnown";
export type WorldState = { items: Record<ItemId, RoomId | string>; flags: { pumpOpen: boolean; stairOpen: boolean; lineFound: boolean; pumpBraced: boolean; boatsWarned: boolean; marketWarned: boolean; evacuated: boolean }; clues: Record<ClueId, boolean>; ending: "none" | "balanced" | "diverted" | "shuttered" | "deferred"; dial: "unset" | "balanced" | "diverted" | "shut"; beacon: "dark" | "lit"; journal: string[] };
export function initialWorld(): WorldState {
  return { items: { "safety-line": "quay", "hand-mirror": "tavern", "glass-prism": "archive" },
    flags: { pumpOpen: false, stairOpen: false, lineFound: false, pumpBraced: false, boatsWarned: false, marketWarned: false, evacuated: false },
    clues: { plateRead: false, marketPatternHeard: false, archivePlanRead: false, balanceKnown: false },
    ending: "none", dial: "unset", beacon: "dark", journal: [] };
}
export function roomId(value: string): value is RoomId { return Object.hasOwn(rooms, value); }
export function itemId(value: string): value is ItemId { return ["safety-line", "hand-mirror", "glass-prism"].includes(value); }
export function canMove(world: WorldState, from: RoomId, to: RoomId): boolean {
  const exits: Record<string, string> = rooms[from].exits;
  if (exits[to] !== to) return false;
  if ((from === "pump" && to === "archive") || (from === "archive" && to === "pump")) return world.flags.pumpOpen;
  if ((from === "tower" && to === "archive") || (from === "archive" && to === "tower")) return world.flags.stairOpen;
  return true;
}
export function viewRoom(world: WorldState, room: RoomId, actor: string): string {
  const info = rooms[room];
  const exits = Object.values(info.exits).map((to) => `${rooms[to as RoomId].name}${canMove(world, room, to as RoomId) ? "" : " (blocked)"}`).join(", ");
  const visible = info.objects.filter((item) => (item !== "safety-line" || world.flags.lineFound) && world.items[item as ItemId] === room);
  return `${info.name}. ${info.text} Exits: ${exits}. Visible items: ${visible.length ? visible.join(", ") : "none"}.`;
}
export function examine(world: WorldState, room: RoomId, target: string): string | null {
  if (room === "quay" && target === "cleat" && world.items["safety-line"] === "quay") return "A reusable safety-line is coiled beneath the cleat.";
  if (target === "safety-line" && !world.flags.lineFound) return null;
  if (itemId(target) && world.items[target] === room) return `You see ${target} here.`;
  if (room === "tavern" && target === "survey-plate") return "The brass survey plate shows the harbor controls: BALANCE, DIVERT, SHUT, then LIGHT.";
  if (room === "market" && target === "gauge-slate") return "Suri's slate marks a level middle setting between two channels.";
  if (room === "pump" && target === "pressure-diagram") return "A diagram shows a balanced notch and the lever controlling the archive hatch.";
  if (room === "archive" && target === "harbor-plan") return "The harbor plan says the pressure clutch slipped; set BALANCE before lighting the beacon.";
  if (room === "tower" && target === "dial") return "The dial is marked BALANCE, DIVERT, SHUT; the lantern remains dark.";
  return null;
}

export function talk(world: WorldState, room: RoomId, npc: string): { text: string; clue: ClueId } | null {
  if (room === "tavern" && npc === "pell") return { text: "Pell points to the survey plate: balance the harbor pressure before lighting the beacon.", clue: "plateRead" };
  if (room === "market" && npc === "suri") return { text: "Suri demonstrates the middle BALANCE mark on her slate; the market route leads to the Pump House.", clue: "marketPatternHeard" };
  if ((room === "tower" || room === "quay") && npc === "mara") return { text: "Mara explains: BALANCE before LIGHT; DIVERT floods the Market run, while SHUT requires a warning to the boats.", clue: "balanceKnown" };
  return null;
}
