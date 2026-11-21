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
import { sleepMinutes } from "./sleep";
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
  sleepMin: number | null;
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

/** Loads everything logged between two dates (inclusive) and summarises each day. */
export async function loadRange(from: string, to: string) {
  const sb = supabase();
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
    d.sleepMin = sleepMinutes(row.bed_time, row.wake_time);
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

  return { days, profile, hasWeight, error };
}
