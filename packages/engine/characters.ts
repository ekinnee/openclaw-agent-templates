export const archetypes = {
  "quay-runner": { name: "Quay Runner", attributes: { grit: 1, wits: 2, charm: 0 } },
  tidehand: { name: "Tidehand", attributes: { grit: 2, wits: 1, charm: 0 } },
  "lantern-singer": { name: "Lantern Singer", attributes: { grit: 0, wits: 1, charm: 2 } },
} as const;

export type Archetype = keyof typeof archetypes;
export const archetypeIds = Object.keys(archetypes) as Archetype[];
export function isArchetype(value: unknown): value is Archetype {
  return typeof value === "string" && Object.hasOwn(archetypes, value);
}
