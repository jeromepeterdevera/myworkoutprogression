import { WorkoutType } from "./workout";

export type Muscle =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves";

export const MUSCLES: { value: Muscle; label: string }[] = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "forearms", label: "Forearms" },
  { value: "quads", label: "Quads" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "glutes", label: "Glutes" },
  { value: "calves", label: "Calves" },
];

const LEGS: Muscle[] = ["quads", "hamstrings", "glutes", "calves"];

/** The muscles each workout type trains. */
export const TYPE_MUSCLES: Record<WorkoutType, Muscle[]> = {
  push: ["chest", "shoulders", "triceps"],
  pull: ["back", "biceps", "forearms"],
  upper: ["chest", "back", "shoulders", "biceps", "triceps", "forearms"],
  legs: LEGS,
  lower: LEGS,
  rest: [],
};

export const muscleLabel = (m: Muscle) => MUSCLES.find((x) => x.value === m)?.label ?? m;

const ORDER = new Map(MUSCLES.map((m, i) => [m.value, i]));
export const sortMuscles = (ms: Muscle[]) => [...new Set(ms)].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);

export function toMuscles(raw: unknown): Muscle[] {
  if (!Array.isArray(raw)) return [];
  return sortMuscles(raw.filter((m): m is Muscle => ORDER.has(m as Muscle)));
}
