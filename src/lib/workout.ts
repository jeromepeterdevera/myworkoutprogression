export type WorkoutType = "push" | "pull" | "legs" | "upper" | "lower" | "rest";
export type Unit = "kg" | "lb";
export type Mode = "reps" | "time";
export type Section = "main" | "core";

export const WORKOUT_TYPES: { value: WorkoutType; label: string; short: string; color: string }[] = [
  { value: "push", label: "Push", short: "PUSH", color: "bg-rose-500" },
  { value: "pull", label: "Pull", short: "PULL", color: "bg-sky-500" },
  { value: "legs", label: "Legs", short: "LEGS", color: "bg-emerald-500" },
  { value: "upper", label: "Upper Body", short: "UPPER", color: "bg-violet-500" },
  { value: "lower", label: "Lower Body", short: "LOWER", color: "bg-amber-500" },
  { value: "rest", label: "Rest", short: "REST", color: "bg-zinc-400" },
];

export function typeInfo(t: WorkoutType | null | undefined) {
  return WORKOUT_TYPES.find((w) => w.value === t);
}

export interface SetEntry {
  reps: number | null;
  weight: number | null;
  seconds: number | null;
}

export interface ExerciseEntry {
  key: string; // client-side id
  name: string;
  section: Section;
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
}

export interface DayExerciseRow {
  section: Section;
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
}

const LB_TO_KG = 0.45359237;

export function convert(weight: number, from: Unit, to: Unit) {
  if (from === to) return weight;
  return from === "lb" ? weight * LB_TO_KG : weight / LB_TO_KG;
}

/** Volume = reps × weight, summed over sets, in the given display unit */
export function exerciseVolume(ex: { unit: Unit; mode: Mode; sets: SetEntry[] }, display: Unit) {
  if (ex.mode !== "reps") return 0;
  return ex.sets.reduce((sum, s) => {
    if (!s.reps || !s.weight) return sum;
    return sum + s.reps * convert(s.weight, ex.unit, display);
  }, 0);
}

export interface DayTotals {
  volume: number;
  sets: number;
  reps: number;
  coreSets: number;
  coreSeconds: number;
}

export function dayTotals(rows: DayExerciseRow[], display: Unit): DayTotals {
  const t: DayTotals = { volume: 0, sets: 0, reps: 0, coreSets: 0, coreSeconds: 0 };
  for (const r of rows) {
    const done = r.sets.filter((s) => s.reps || s.weight || s.seconds);
    t.volume += exerciseVolume(r, display);
    t.reps += done.reduce((a, s) => a + (s.reps ?? 0), 0);
    if (r.section === "core") {
      t.coreSets += done.length;
      t.coreSeconds += done.reduce((a, s) => a + (s.seconds ?? 0), 0);
    } else {
      t.sets += done.length;
    }
  }
  return t;
}

export function formatNumber(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function formatSeconds(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

export function formatSet(s: SetEntry, mode: Mode, unit: Unit) {
  if (mode === "time") return s.seconds ? formatSeconds(s.seconds) : "–";
  const reps = s.reps ?? "–";
  return s.weight ? `${reps}×${s.weight}${unit}` : `${reps} reps`;
}

/** YYYY-MM-DD in local time */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function newKey() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
