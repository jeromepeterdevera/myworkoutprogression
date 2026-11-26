import { WorkoutType } from "./workout";

export type Muscle =
  | "upper_chest"
  | "middle_chest"
  | "lower_chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "traps"
  | "rhomboids"
  | "lats"
  | "upper_abs"
  | "lower_abs"
  | "obliques"
  | "biceps"
  | "triceps"
  | "forearms"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves";

export type Group = "chest" | "shoulders" | "back" | "core" | "arms" | "legs";

export interface Part {
  value: Muscle;
  /** name inside its group, e.g. "Upper" under Chest */
  short: string;
  /** full name, e.g. "Upper Chest" */
  label: string;
}

export const GROUPS: { value: Group; label: string; parts: Part[] }[] = [
  {
    value: "chest",
    label: "Chest",
    parts: [
      { value: "upper_chest", short: "Upper", label: "Upper Chest" },
      { value: "middle_chest", short: "Middle", label: "Middle Chest" },
      { value: "lower_chest", short: "Lower", label: "Lower Chest" },
    ],
  },
  {
    value: "shoulders",
    label: "Shoulders",
    parts: [
      { value: "front_delts", short: "Front Delts", label: "Front Delts" },
      { value: "side_delts", short: "Side Delts", label: "Side Delts" },
      { value: "rear_delts", short: "Rear Delts", label: "Rear Delts" },
    ],
  },
  {
    value: "back",
    label: "Back",
    parts: [
      { value: "traps", short: "Traps", label: "Traps" },
      { value: "rhomboids", short: "Rhomboids", label: "Rhomboids" },
      { value: "lats", short: "Lats", label: "Lats" },
    ],
  },
  {
    value: "core",
    label: "Core",
    parts: [
      { value: "upper_abs", short: "Upper Abs", label: "Upper Abs" },
      { value: "lower_abs", short: "Lower Abs", label: "Lower Abs" },
      { value: "obliques", short: "Obliques", label: "Obliques" },
    ],
  },
  {
    value: "arms",
    label: "Arms",
    parts: [
      { value: "biceps", short: "Biceps", label: "Biceps" },
      { value: "triceps", short: "Triceps", label: "Triceps" },
      { value: "forearms", short: "Forearms", label: "Forearms" },
    ],
  },
  {
    value: "legs",
    label: "Legs",
    parts: [
      { value: "glutes", short: "Glutes", label: "Glutes" },
      { value: "quads", short: "Quads", label: "Quads" },
      { value: "hamstrings", short: "Hamstrings", label: "Hamstrings" },
      { value: "calves", short: "Calf", label: "Calf" },
    ],
  },
];

const PARTS = GROUPS.flatMap((g) => g.parts.map((p) => ({ ...p, group: g.value })));
const ORDER = new Map(PARTS.map((p, i) => [p.value, i]));

export const muscleLabel = (m: Muscle) => PARTS.find((p) => p.value === m)?.label ?? m;
export const groupLabel = (g: Group) => GROUPS.find((x) => x.value === g)?.label ?? g;
export const groupOf = (m: Muscle) => PARTS.find((p) => p.value === m)!.group;
export const partsOf = (g: Group) => GROUPS.find((x) => x.value === g)!.parts.map((p) => p.value);
export const sortMuscles = (ms: Muscle[]) => [...new Set(ms)].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);

const PUSH: Muscle[] = ["upper_chest", "middle_chest", "lower_chest", "front_delts", "side_delts", "triceps"];
const PULL: Muscle[] = ["traps", "rhomboids", "lats", "rear_delts", "biceps", "forearms"];
const LEGS: Muscle[] = ["glutes", "quads", "hamstrings", "calves"];
export const CORE_MUSCLES: Muscle[] = ["upper_abs", "lower_abs", "obliques"];

/** The muscles each workout type trains. */
export const TYPE_MUSCLES: Record<WorkoutType, Muscle[]> = {
  push: PUSH,
  pull: PULL,
  upper: sortMuscles([...PUSH, ...PULL]),
  legs: LEGS,
  lower: LEGS,
  rest: [],
};

/** An exercise's tags. `legacy` holds old broad tags (Chest, Back, Shoulders) that still need a specific part. */
export interface Tag {
  muscles: Muscle[];
  legacy: Group[];
}

export const NO_TAG: Tag = { muscles: [], legacy: [] };
const LEGACY = new Set<string>(["chest", "back", "shoulders"]);

export function toTag(raw: unknown): Tag {
  if (!Array.isArray(raw)) return NO_TAG;
  return {
    muscles: sortMuscles(raw.filter((m): m is Muscle => ORDER.has(m as Muscle))),
    legacy: [...new Set(raw.filter((m) => LEGACY.has(m)))] as Group[],
  };
}

export const isTagged = (t: Tag) => t.muscles.length > 0 || t.legacy.length > 0;

/** Muscles the tag covers, counting an old broad tag as its whole group until it's re-tagged. */
export const covered = (t: Tag): Muscle[] => sortMuscles([...t.muscles, ...t.legacy.flatMap(partsOf)]);

/** Groups (in order) that contain any of these muscles. */
export const groupsOf = (ms: Muscle[]) => GROUPS.filter((g) => g.parts.some((p) => ms.includes(p.value))).map((g) => g.value);

/** "Upper Chest · Triceps", plus "Chest (pick a part)" for old broad tags. */
export function tagText(t: Tag) {
  return [...t.muscles.map(muscleLabel), ...t.legacy.map((g) => `${groupLabel(g)} (pick a part)`)].join(" · ");
}
