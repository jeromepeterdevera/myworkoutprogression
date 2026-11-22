import { supabase } from "./supabase";
import {
  FALLBACK_KG,
  Intensity,
  Profile,
  baselineKcal,
  runKcal,
  sportKcal,
  weightOn,
  weightTrainingKcal,
} from "./activity";
import { macrosFor, toFood } from "./nutrition";
import { SleepContext, asleepMinutes, estimateLatency, readSleepGoal, sleepMinutes } from "./sleep";
import { DayExerciseRow, WorkoutType, dayTotals, parseISODate, toISODate } from "./workout";

export interface DaySummary {
  date: string;
  workoutType: WorkoutType | null;
  exercises: DayExerciseRow[];
  sports: string[];
  runs: { seconds: number; distance: number | null; unit: "km" | "mi" }[];
  /** calories burned by logged workouts (on top of baseline) */
  exerciseKcal: number;
  /** calories eaten, null when no meals were logged */
  intake: number | null;
  protein: number | null;
  /** calories burned without workouts (BMR × activity), null without a complete profile */
  baseline: number | null;
  /** intake − (baseline + exercise); null if intake or baseline is missing */
  balance: number | null;
  /** estimated minutes asleep (time in bed minus the time it took to fall asleep) */
  sleepMin: number | null;
  /** minutes between going to bed and waking up */
  inBedMin: number | null;
  /** estimated minutes it took to fall asleep */
  fallAsleepMin: number | null;
  bedTime: string | null;
  /** weight logged on this day */
  weightKg: number | null;
}

type Result<T> = { data: T[] | null; error: { message: string } | null };

/** Supabase returns at most 1000 rows per request; page through all of them. */
async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<Result<T>>): Promise<Result<T>> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  const d = parseISODate(from);
  const end = parseISODate(to);
  while (d <= end) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export async function loadProfile(): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase().from("profiles").select("sex, birth_year, height_cm, activity_factor").maybeSingle();
  if (error) return { profile: null, error: error.message };
  if (!data) return { profile: null, error: null };
  return {
    profile: {
      sex: data.sex,
      birth_year: data.birth_year,
      height_cm: data.height_cm == null ? null : Number(data.height_cm),
      activity_factor: Number(data.activity_factor),
    },
    error: null,
  };
}

export function addDays(iso: string, n: number) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Night history needed to estimate sleep on `date` (the morning you woke up). */
const CONTEXT_DAYS = 8;

/** What happened the day before `date` and on the nights before, for estimateLatency. */
export function sleepContextFor(date: string, days: Record<string, DaySummary>, goalMin: number): SleepContext {
  const prev = days[addDays(date, -1)];
  const recentBeds: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const b = days[addDays(date, -i)]?.bedTime;
    if (b) recentBeds.push(b);
  }
  return {
    // nothing logged that day is unknown, not a rest day
    exerciseKcal: prev && (prev.workoutType || prev.sports.length || prev.runs.length) ? prev.exerciseKcal : null,
    balance: prev?.balance ?? null,
    prevNightAsleep: prev?.sleepMin ?? null,
    recentBeds,
    goalMin,
  };
}

/** Loads everything logged between two dates (inclusive) and summarises each day. */
export async function loadRange(rangeFrom: string, to: string) {
  const sb = supabase();
  // a week earlier too, so the first nights in range can be estimated from the days before them
  const from = addDays(rangeFrom, -CONTEXT_DAYS);
  const [w, l, allW, m, s, r, p] = await Promise.all([
    fetchAll((a, b) =>
      sb
        .from("workout_days")
        .select("date, type, duration_min, day_exercises(section, unit, mode, sets)")
        .gte("date", from)
        .lte("date", to)
        .range(a, b)
    ),
    fetchAll((a, b) => sb.from("daily_logs").select("date, weight_kg, bed_time, wake_time").gte("date", from).lte("date", to).range(a, b)),
    fetchAll((a, b) => sb.from("daily_logs").select("date, weight_kg").not("weight_kg", "is", null).order("date").range(a, b)),
    fetchAll((a, b) => sb.from("meal_items").select("date, quantity, foods(*)").gte("date", from).lte("date", to).range(a, b)),
    fetchAll((a, b) => sb.from("sport_sessions").select("date, sport, minutes, intensity").gte("date", from).lte("date", to).range(a, b)),
    fetchAll((a, b) => sb.from("runs").select("date, seconds, distance, distance_unit").gte("date", from).lte("date", to).range(a, b)),
    loadProfile(),
  ]);

  const error = [w, l, allW, m, s, r].find((x) => x.error)?.error?.message ?? p.error;
  const profile = p.profile;

  const weights = (allW.data as { date: string; weight_kg: number }[]).map((x) => ({ date: x.date, kg: Number(x.weight_kg) }));
  const hasWeight = weights.length > 0;

  const days: Record<string, DaySummary> = {};
  for (const date of datesBetween(from, to)) {
    days[date] = {
      date,
      workoutType: null,
      exercises: [],
      sports: [],
      runs: [],
      exerciseKcal: 0,
      intake: null,
      protein: null,
      baseline: null,
      balance: null,
      sleepMin: null,
      inBedMin: null,
      fallAsleepMin: null,
      bedTime: null,
      weightKg: null,
    };
  }
  const kgOn = (date: string) => weightOn(date, weights) ?? FALLBACK_KG;

  type WRow = { date: string; type: WorkoutType | null; duration_min: number | null; day_exercises: DayExerciseRow[] };
  for (const row of w.data as WRow[]) {
    const d = days[row.date];
    if (!d) continue;
    d.workoutType = row.type;
    d.exercises = row.day_exercises ?? [];
    const t = dayTotals(d.exercises, "kg");
    d.exerciseKcal += weightTrainingKcal(row.duration_min == null ? null : Number(row.duration_min), t.sets + t.coreSets, kgOn(row.date));
  }

  type LRow = { date: string; weight_kg: number | null; bed_time: string | null; wake_time: string | null };
  for (const row of l.data as LRow[]) {
    const d = days[row.date];
    if (!d) continue;
    d.weightKg = row.weight_kg == null ? null : Number(row.weight_kg);
    d.inBedMin = sleepMinutes(row.bed_time, row.wake_time);
    d.bedTime = row.bed_time ? row.bed_time.slice(0, 5) : null;
  }

  type MRow = { date: string; quantity: number; foods: Record<string, unknown> | null };
  for (const row of m.data as unknown as MRow[]) {
    const d = days[row.date];
    if (!d || !row.foods) continue;
    const mm = macrosFor(toFood(row.foods), Number(row.quantity));
    d.intake = (d.intake ?? 0) + mm.kcal;
    d.protein = (d.protein ?? 0) + mm.protein;
  }

  type SRow = { date: string; sport: string; minutes: number; intensity: Intensity };
  for (const row of s.data as SRow[]) {
    const d = days[row.date];
    if (!d) continue;
    d.sports.push(row.sport);
    d.exerciseKcal += sportKcal({ sport: row.sport, minutes: Number(row.minutes), intensity: row.intensity }, kgOn(row.date));
  }

  type RRow = { date: string; seconds: number; distance: number | null; distance_unit: "km" | "mi" };
  for (const row of r.data as RRow[]) {
    const d = days[row.date];
    if (!d) continue;
    const run = { seconds: Number(row.seconds), distance: row.distance == null ? null : Number(row.distance), unit: row.distance_unit };
    d.runs.push(run);
    d.exerciseKcal += runKcal(run, kgOn(row.date));
  }

  for (const d of Object.values(days)) {
    d.baseline = baselineKcal(profile, kgOn(d.date), d.date);
    if (d.intake != null && d.baseline != null) d.balance = d.intake - d.baseline - d.exerciseKcal;
  }

  // nights in date order: each estimate uses the night before it
  const goal = readSleepGoal();
  for (const date of datesBetween(from, to)) {
    const d = days[date];
    if (d.inBedMin == null || !d.bedTime) continue;
    const { minutes } = estimateLatency(d.bedTime, sleepContextFor(date, days, goal));
    d.fallAsleepMin = minutes;
    d.sleepMin = asleepMinutes(d.inBedMin, minutes);
  }
  for (const date of Object.keys(days)) if (date < rangeFrom) delete days[date];

  return { days, profile, hasWeight, error };
}
