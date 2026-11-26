// Training effort and load.
// Load = effort (1–10, how hard the day felt) × minutes trained. This is "session RPE", a standard
// sports-science measure that works the same for lifting, sports and running.
// Days you don't rate get an estimated effort, from how your lifts compare with your usual for each
// exercise, the intensity you picked for sports, and your running speed.

import { Intensity, runMet, weightTrainingMinutes } from "./activity";
import { Mode, SetEntry, Unit, WorkoutType, convert, formatSeconds } from "./workout";

export const EFFORTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function effortLabel(n: number) {
  const r = Math.round(n);
  if (r <= 2) return "Very easy";
  if (r <= 4) return "Easy";
  if (r <= 6) return "Moderate";
  if (r <= 8) return "Hard";
  if (r === 9) return "Very hard";
  return "All-out";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hasData = (s: SetEntry) => !!(s.reps || s.weight || s.seconds);

interface Lift {
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
}

// ---------- one exercise ----------

/** Amount of work, comparable between sessions of the same exercise: kg × reps, reps for bodyweight, seconds when timed. */
export function workOf(ex: Lift) {
  if (ex.mode === "time") return ex.sets.reduce((a, s) => a + (s.seconds ?? 0), 0);
  const weighted = ex.sets.some((s) => s.reps && s.weight);
  return ex.sets.reduce((a, s) => {
    if (!s.reps) return a;
    if (!weighted) return a + s.reps;
    return s.weight ? a + s.reps * convert(s.weight, ex.unit, "kg") : a;
  }, 0);
}

/** Estimated one-rep max in kg from the best set (Epley), 0 when there is no weighted set of 1–15 reps. */
export function e1rm(ex: Lift) {
  if (ex.mode !== "reps") return 0;
  let best = 0;
  for (const s of ex.sets) {
    if (!s.reps || !s.weight || s.reps > 15) continue;
    const kg = convert(s.weight, ex.unit, "kg");
    best = Math.max(best, s.reps === 1 ? kg : kg * (1 + s.reps / 30));
  }
  return best;
}

export interface LiftSession {
  date: string;
  work: number;
  e1rm: number;
}

/** Past sessions per exercise (lower-case name), oldest first. Only add sessions before the day you're looking at. */
export type LiftHistory = Map<string, LiftSession[]>;

export function addToHistory(hist: LiftHistory, name: string, date: string, ex: Lift) {
  const sets = ex.sets.filter(hasData);
  if (!sets.length) return;
  const key = name.toLowerCase();
  const list = hist.get(key) ?? [];
  list.push({ date, work: workOf({ ...ex, sets }), e1rm: e1rm({ ...ex, sets }) });
  hist.set(key, list);
}

/** Best estimated one-rep max before now, in kg (0 if none). */
export function bestBefore(hist: LiftHistory, name: string) {
  return (hist.get(name.toLowerCase()) ?? []).reduce((a, s) => Math.max(a, s.e1rm), 0);
}

/** This session's work compared with the median of your last 4 sessions of this exercise (1 = typical). */
function relativeWork(hist: LiftHistory, name: string, ex: Lift) {
  const past = (hist.get(name.toLowerCase()) ?? []).slice(-4).map((s) => s.work).filter((w) => w > 0);
  const work = workOf(ex);
  if (!past.length || !work) return null;
  const sorted = [...past].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return work / median;
}

// ---------- progress verdict ----------

export interface Verdict {
  text: string;
  tone: "best" | "up" | "same" | "down";
}

/** How this exercise went compared with last time, in a few words. */
export function verdict(cur: Lift, last: Lift | null, best: number, display: Unit): Verdict | null {
  const sets = cur.sets.filter(hasData);
  if (!sets.length) return null;
  const now = { ...cur, sets };
  const mine = e1rm(now);
  if (mine > 0 && best > 0 && mine > best + 0.01) return { text: "New best", tone: "best" };
  if (!last || last.mode !== cur.mode) return null;

  const say = (diff: number, unit: string, round: (n: number) => string): Verdict =>
    Math.abs(diff) < 1e-9
      ? { text: "Same as last", tone: "same" }
      : { text: `${diff > 0 ? "+" : "−"}${round(Math.abs(diff))}${unit} vs last`, tone: diff > 0 ? "up" : "down" };

  if (cur.mode === "time") {
    const total = (l: Lift) => l.sets.reduce((a, s) => a + (s.seconds ?? 0), 0);
    const d = total(now) - total(last);
    return d === 0 ? { text: "Same as last", tone: "same" } : { text: `${d > 0 ? "+" : "−"}${formatSeconds(Math.abs(d))} vs last`, tone: d > 0 ? "up" : "down" };
  }

  const top = (l: Lift) => {
    let w = 0;
    let reps = 0;
    for (const s of l.sets) {
      if (!s.reps) continue;
      const kg = s.weight ? convert(s.weight, l.unit, "kg") : 0;
      if (kg > w + 1e-9 || (Math.abs(kg - w) < 1e-9 && s.reps > reps)) {
        w = kg;
        reps = s.reps;
      }
    }
    return { kg: w, reps };
  };
  const a = top(now);
  const b = top(last);
  if (a.kg > 0 || b.kg > 0) {
    const dw = Math.round((convert(a.kg, "kg", display) - convert(b.kg, "kg", display)) * 10) / 10;
    if (dw !== 0) return say(dw, ` ${display}`, (n) => String(n));
    const dr = a.reps - b.reps;
    return say(dr, Math.abs(dr) === 1 ? " rep" : " reps", (n) => String(n));
  }
  const reps = (l: Lift) => l.sets.reduce((x, s) => x + (s.reps ?? 0), 0);
  const dr = reps(now) - reps(last);
  return say(dr, Math.abs(dr) === 1 ? " rep" : " reps", (n) => String(n));
}

// ---------- a whole day ----------

export interface TrainingInput {
  type: WorkoutType | null;
  durationMin: number | null;
  exercises: (Lift & { name: string })[];
  sports: { minutes: number | null; intensity: Intensity }[];
  runs: { seconds: number | null; distance: number | null; unit: "km" | "mi" }[];
  /** your 1–10 rating, null if not rated */
  rated: number | null;
}

export interface DayTraining {
  minutes: number;
  rated: number | null;
  /** estimate from what you logged, 1–10 */
  estimated: number;
  /** rated, else estimated */
  effort: number;
  /** effort × minutes */
  load: number;
  /** exercises where you beat your best estimated one-rep max */
  bests: string[];
}

const SPORT_EFFORT: Record<Intensity, number> = { light: 3, moderate: 5, vigorous: 7 };

/** Effort and load for a day; null when nothing with a duration was logged. `hist` must only hold earlier days. */
export function trainingFor(day: TrainingInput, hist: LiftHistory): DayTraining | null {
  const done = day.exercises.map((e) => ({ ...e, sets: e.sets.filter(hasData) })).filter((e) => e.sets.length);
  const setCount = done.reduce((a, e) => a + e.sets.length, 0);
  const liftMin = setCount || day.durationMin ? weightTrainingMinutes(day.durationMin, setCount) : 0;

  // weights: 6/10 for a typical session, more or less as your work is above or below your usual
  let wSum = 0;
  let wRatio = 0;
  for (const e of done) {
    const r = relativeWork(hist, e.name, e);
    if (r == null) continue;
    wSum += e.sets.length;
    wRatio += clamp(r, 0.3, 2) * e.sets.length;
  }
  const liftEffort = clamp(6 + 5 * ((wSum ? wRatio / wSum : 1) - 1), 3, 9);

  const parts: { min: number; effort: number }[] = [];
  if (liftMin) parts.push({ min: liftMin, effort: liftEffort });
  for (const s of day.sports) if (s.minutes) parts.push({ min: s.minutes, effort: SPORT_EFFORT[s.intensity] });
  for (const r of day.runs) if (r.seconds) parts.push({ min: r.seconds / 60, effort: clamp(runMet(r.seconds, r.distance, r.unit) * 0.6, 3, 9) });

  const minutes = parts.reduce((a, p) => a + p.min, 0);
  if (!minutes) return null;
  const estimated = Math.round((parts.reduce((a, p) => a + p.min * p.effort, 0) / minutes) * 10) / 10;
  const effort = day.rated ?? estimated;

  const bests = done
    .filter((e) => {
      const b = bestBefore(hist, e.name);
      return b > 0 && e1rm(e) > b + 0.01;
    })
    .map((e) => e.name);

  return { minutes, rated: day.rated, estimated, effort, load: Math.round(effort * minutes), bests };
}

/** Typical load of a hard-ish hour, used until there are a few weeks of history. */
const DEFAULT_LOAD = 300;
export const LOOKBACK_DAYS = 28;

/** 1–5: how this day's load compares with your active days over the previous 4 weeks. */
export function effortLevel(load: number, priorActiveLoads: number[]) {
  const ref = priorActiveLoads.length >= 4 ? priorActiveLoads.reduce((a, b) => a + b, 0) / priorActiveLoads.length : DEFAULT_LOAD;
  const q = load / ref;
  if (q < 0.6) return 1;
  if (q < 0.85) return 2;
  if (q < 1.15) return 3;
  if (q < 1.4) return 4;
  return 5;
}

export const LEVEL_LABELS = ["", "Much easier than usual", "Easier than usual", "About usual", "Harder than usual", "Much harder than usual"];
