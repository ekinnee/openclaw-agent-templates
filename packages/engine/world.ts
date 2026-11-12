// Authored Lantern Below world data and deterministic player-safe projections.
// GM-only explanations remain in the Template; this module contains no secret solutions.
export const rooms = {
  quay: { name: "Lantern Quay", text: "Three uneven bell notes travel through the harbor planks.", exits: { tavern: "tavern", market: "market", tower: "tower" }, objects: ["safety-line"] },
  tavern: { name: "Crooked Compass", text: "Warm windows and old harbor charts surround Pell's table.", exits: { quay: "quay", market: "market" }, objects: ["hand-mirror"] },
  market: { name: "Tide Market", text: "Suri watches water pulse between the market stalls.", exits: { quay: "quay", tavern: "tavern", pump: "pump" }, objects: ["weather-crate", "colored-twine"] },
  pump: { name: "Pump House", text: "A lever and wheel face one another across a vibrating channel.", exits: { market: "market", archive: "archive" }, objects: [] },
  archive: { name: "Flooded Archive", text: "Shelves rise above shallow water and a brass harbor plan.", exits: { pump: "pump", tower: "tower" }, objects: ["glass-prism"] },
  tower: { name: "Beacon Tower", text: "Mara Vale, the lamplighter, stands by the lantern and its control dial.", exits: { quay: "quay", archive: "archive" }, objects: [] },
} as const;
export type RoomId = keyof typeof rooms;
export type ItemId = "safety-line" | "hand-mirror" | "glass-prism" | "weather-crate" | "colored-twine";
export const itemIds: readonly ItemId[] = ["safety-line", "hand-mirror", "glass-prism", "weather-crate", "colored-twine"];
export type ClueId = "plateRead" | "marketPatternHeard" | "archivePlanRead" | "balanceKnown" | "stakesKnown";
export type WorldState = { items: Record<ItemId, RoomId | string>; flags: { pumpOpen: boolean; pressureRelieved?: boolean; stairOpen: boolean; lineFound: boolean; pumpBraced: boolean; boatsWarned: boolean; marketWarned: boolean; evacuated: boolean; archiveShelfSettled: boolean; suriOfferedHelp?: boolean }; clues: Record<ClueId, boolean>; surge: number; reflector: "none" | "glass-prism" | "hand-mirror" | "improvised"; ending: "none" | "balanced" | "diverted" | "shuttered" | "deferred"; dial: "unset" | "balanced" | "diverted" | "shut"; beacon: "dark" | "lit"; journal: string[] };
export function initialWorld(): WorldState {
  return { items: { "safety-line": "quay", "hand-mirror": "tavern", "glass-prism": "archive", "weather-crate": "market", "colored-twine": "market" },
    flags: { pumpOpen: false, stairOpen: false, lineFound: false, pumpBraced: false, boatsWarned: false, marketWarned: false, evacuated: false, archiveShelfSettled: false },
    clues: { plateRead: false, marketPatternHeard: false, archivePlanRead: false, balanceKnown: false, stakesKnown: false },
    surge: 0, reflector: "none", ending: "none", dial: "unset", beacon: "dark", journal: [] };
}
export function roomId(value: string): value is RoomId { return Object.hasOwn(rooms, value); }
export function itemId(value: string): value is ItemId { return itemIds.includes(value as ItemId); }
export function canMove(world: WorldState, from: RoomId, to: RoomId): boolean {
  const exits: Record<string, string> = rooms[from].exits;
  if (exits[to] !== to) return false;
  if ((from === "pump" && to === "archive") || (from === "archive" && to === "pump")) return world.flags.pumpOpen;
  if ((from === "tower" && to === "archive") || (from === "archive" && to === "tower")) return world.flags.stairOpen;
  return true;
}
const dialLabels = { unset: "between marks", balanced: "BALANCE", diverted: "DIVERT", shut: "SHUT" } as const;

function beaconDescription(world: WorldState): string {
  return world.beacon === "lit" ? "The beacon shines across the harbor." : "The beacon is dark.";
}

export function viewRoom(world: WorldState, room: RoomId, actor: string): string {
  const info = rooms[room];
  const exits = Object.values(info.exits).map((to) => `${rooms[to as RoomId].name}${canMove(world, room, to as RoomId) ? "" : " (blocked)"}`).join(", ");
  const visible = info.objects.filter((item) => (item !== "safety-line" || world.flags.lineFound) && world.items[item as ItemId] === room);
  let description: string = info.text;
  if (room === "quay") {
    description = [beaconDescription(world), world.ending === "none" ? info.text : ""].filter(Boolean).join(" ");
  } else if (room === "tower") {
    const socket = world.reflector === "none" ? "The lens socket is empty." : "A reflector is fitted in the lens socket.";
    const stair = world.flags.stairOpen ? "The service stair is open." : "The service stair is bolted closed.";
    description = `${info.text} ${beaconDescription(world)} The dial rests ${world.dial === "unset" ? dialLabels.unset : `at ${dialLabels[world.dial]}`}. ${socket} ${stair}`;
  }
  if ((room === "tower" || room === "pump") && world.ending === "none") {
    description += world.flags.pressureRelieved ? " The pressure gauge has settled." : " The pressure gauge trembles in the red.";
  }
  return `${info.name}. ${description} Exits: ${exits}. Visible items: ${visible.length ? visible.join(", ") : "none"}.`;
}
export function examine(world: WorldState, room: RoomId, target: string): string | null {
  if (room === "quay" && target === "cleat" && world.items["safety-line"] === "quay") return "A reusable safety-line is coiled beneath the cleat.";
  if (target === "safety-line" && !world.flags.lineFound) return null;
  if (itemId(target) && world.items[target] === room) return `You see ${target} here.`;
  if (room === "tavern" && target === "survey-plate") return "The plate says: release pressure at the Pump House, then set BALANCE and light the beacon to protect both shores. DIVERT spares the Quay but floods the Market run. SHUT keeps the Market dry but leaves the beacon dark, so warn the boats.";
  if (room === "market" && target === "gauge-slate") return "Suri's slate shows pressure trapped behind the harbor gates. The Pump House release wheel must turn before the middle BALANCE setting can protect both shores.";
  if (room === "pump" && target === "pressure-diagram") return "The diagram shows how to vent trapped pressure: hold the lever while turning the release wheel. The hatch can also be opened from the Archive, but that latch does not turn the release wheel.";
  if (room === "archive" && target === "harbor-plan") return "The harbor plan shows where the pressure clutch slipped. The prism focuses light, while the Pump House release wheel vents the pressure. After venting, BALANCE protects both shores. DIVERT spares the Quay but floods the Market. SHUT keeps the Market dry and the beacon dark, so warn the boats.";
  if (room === "tower" && target === "dial") return `The dial is marked BALANCE, DIVERT, SHUT. ${beaconDescription(world)}`;
  return null;
}

export function talk(world: WorldState, room: RoomId, npc: string): { text: string; clue: ClueId } | null {
  if (room === "tavern" && npc === "pell") return { text: "Pell points to the survey plate: vent the trapped pressure at the Pump House before choosing BALANCE and lighting the beacon.", clue: "plateRead" };
  if (room === "market" && npc === "suri") return { text: "Suri demonstrates the middle BALANCE mark on her slate. She offers to help at the Pump House by holding the lever while you turn the release wheel.", clue: "marketPatternHeard" };
  if ((room === "tower" || room === "quay") && npc === "mara") return { text: "Mara explains: release the trapped pressure at the Pump House first, then BALANCE and light the beacon to protect both shores. DIVERT spares the Quay but floods the Market run. SHUT keeps the Market dry but leaves the beacon dark, so warn the boats. Deferring repairs needs a town evacuation.", clue: "stakesKnown" };
  return null;
}
