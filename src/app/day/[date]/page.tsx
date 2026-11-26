"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import UnitToggle from "@/components/UnitToggle";
import NumInput from "@/components/NumInput";
import ExerciseCard from "@/components/ExerciseCard";
import ExercisePicker, { HistoryItem } from "@/components/ExercisePicker";
import MusclePicker, { RecentSession } from "@/components/MusclePicker";
import { Muscle, TYPE_MUSCLES, toMuscles } from "@/lib/muscles";
import MealsTab from "@/components/MealsTab";
import { MEALS_ENABLED } from "@/lib/features";
import SportsTab from "@/components/SportsTab";
import RunningTab from "@/components/RunningTab";
import {
  FALLBACK_KG,
  Intensity,
  Profile,
  RunEntry,
  SportEntry,
  baselineKcal,
  runKcal,
  sportKcal,
  weightTrainingKcal,
  weightTrainingMinutes,
} from "@/lib/activity";
import { loadProfile } from "@/lib/daily";
import { EFFORTS, LiftHistory, addToHistory, bestBefore, effortLabel, trainingFor } from "@/lib/effort";
import { Food, Meal, MealEntry, sumEntries, toFood } from "@/lib/nutrition";
import {
  ExerciseEntry,
  Mode,
  Section,
  SetEntry,
  Unit,
  WORKOUT_TYPES,
  WorkoutType,
  convert,
  dayTotals,
  formatSeconds,
  newKey,
  parseISODate,
  toISODate,
  typeInfo,
} from "@/lib/workout";

interface RawRow {
  section: Section;
  position?: number;
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
  exercises: { name: string } | null;
  workout_days?: { date: string; type: WorkoutType | null; effort: number | null } | null;
}

interface MealRow {
  meal: Meal;
  position: number;
  food_id: string;
  quantity: number;
}

type Tab = "workout" | "meals";
const TABS: { value: Tab; label: string }[] = [
  { value: "workout", label: "Workout" },
  { value: "meals", label: "Meals" },
].filter((t) => MEALS_ENABLED || t.value !== "meals") as { value: Tab; label: string }[];
const TAB_KEY = "day-tab";

type WorkoutSub = "weights" | "sports" | "running";
const WORKOUT_SUBS: { value: WorkoutSub; label: string }[] = [
  { value: "weights", label: "Weight Training" },
  { value: "sports", label: "Sports" },
  { value: "running", label: "Running" },
];
const SUB_KEY = "day-workout-sub";

interface SportRow {
  sport: string;
  minutes: number;
  intensity: Intensity;
  sets: { us: number | null; them: number | null }[];
  position: number;
}
interface RunRow {
  seconds: number;
  distance: number | null;
  distance_unit: "km" | "mi";
  position: number;
}

const hasData = (s: SetEntry) => !!(s.reps || s.weight || s.seconds);
const round2 = (n: number) => Math.round(n * 100) / 100;

function toMealEntries(rows: MealRow[]): MealEntry[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ key: newKey(), meal: r.meal, foodId: r.food_id, quantity: Number(r.quantity) }));
}

export default function DayPage() {
  const params = useParams<{ date: string }>();
  const date = params.date;
  const router = useRouter();
  const [displayUnit, setDisplayUnit] = useDisplayUnit();

  const [tab, setTab] = useState<Tab>("workout");

  // workout
  const [type, setType] = useState<WorkoutType | null>(null);
  const [items, setItems] = useState<ExerciseEntry[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [liftHist, setLiftHist] = useState<LiftHistory>(new Map());
  // muscles per exercise (lower-case name) and earlier sessions, for the add-exercises panel
  const [tags, setTags] = useState<Map<string, Muscle[]>>(new Map());
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  // rest timer: when the last set was ticked off
  const [lastSetAt, setLastSetAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sub, setSub] = useState<WorkoutSub>("weights");

  // sports & runs
  const [sports, setSports] = useState<SportEntry[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [pastSports, setPastSports] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  // daily log
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [prevWeight, setPrevWeight] = useState<{ date: string; kg: number } | null>(null);
  // sleep lives on the Sleep page now; times logged here before are passed through untouched
  const [oldSleep, setOldSleep] = useState<{ bed: string | null; wake: string | null }>({ bed: null, wake: null });

  // meals
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [previousMealDate, setPreviousMealDate] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirtyParts, setDirtyParts] = useState({ workout: false, activities: false, meals: false, log: false });
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const dirty = Object.values(dirtyParts).some(Boolean);

  const dateObj = useMemo(() => parseISODate(date), [date]);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TAB_KEY);
      if (TABS.some((x) => x.value === t)) setTab(t as Tab);
      const s = sessionStorage.getItem(SUB_KEY);
      if (s === "weights" || s === "sports" || s === "running") setSub(s);
    } catch {}
  }, []);
  const pickSub = (s: WorkoutSub) => {
    setSub(s);
    try {
      sessionStorage.setItem(SUB_KEY, s);
    } catch {}
  };
  const pickTab = (t: Tab) => {
    setTab(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {}
  };

  const markDirty = (part: keyof typeof dirtyParts) => {
    setDirtyParts((d) => (d[part] ? d : { ...d, [part]: true }));
    setMessage(null);
  };

  // ---------- load ----------
  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const sb = supabase();
    const errors: string[] = [];


    const dayReq = sb
      .from("workout_days")
      .select("type, duration_min, effort, day_exercises(section, position, unit, mode, sets, exercises(name))")
      .eq("date", date)
      .maybeSingle();
    const logReq = sb.from("daily_logs").select("weight_kg, bed_time, wake_time").eq("date", date).maybeSingle();
    const prevWeightReq = sb
      .from("daily_logs")
      .select("date, weight_kg")
      .lt("date", date)
      .not("weight_kg", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const foodsReq = sb.from("foods").select("*").order("name");
    const mealsReq = sb.from("meal_items").select("meal, position, food_id, quantity").eq("date", date);
    const prevMealReq = sb
      .from("meal_items")
      .select("date")
      .lt("date", date)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sportsReq = sb.from("sport_sessions").select("sport, minutes, intensity, sets, position").eq("date", date);
    const runsReq = sb.from("runs").select("seconds, distance, distance_unit, position").eq("date", date);
    const pastSportsReq = sb.from("sport_sessions").select("sport").order("date", { ascending: false }).limit(500);
    const profileReq = loadProfile();
    const tagsReq = sb.from("exercises").select("name, muscles");

    // all previous workout sessions (paged, Supabase returns max 1000 rows per request)
    const histRows: RawRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("day_exercises")
        .select("section, position, unit, mode, sets, exercises(name), workout_days!inner(date, type, effort)")
        .lt("workout_days.date", date)
        .range(from, from + PAGE - 1);
      if (error) {
        errors.push(error.message);
        break;
      }
      histRows.push(...((data ?? []) as unknown as RawRow[]));
      if (!data || data.length < PAGE) break;
    }

    const [dayRes, logRes, prevWRes, foodsRes, mealsRes, prevMealRes, sportsRes, runsRes, pastSportsRes, profileRes, tagsRes] =
      await Promise.all([
        dayReq,
        logReq,
        prevWeightReq,
        foodsReq,
        mealsReq,
        prevMealReq,
        sportsReq,
        runsReq,
        pastSportsReq,
        profileReq,
        tagsReq,
      ]);
    for (const r of [dayRes, logRes, prevWRes, foodsRes, mealsRes, prevMealRes, sportsRes, runsRes, pastSportsRes, tagsRes]) {
      if (r.error) errors.push(r.error.message);
    }
    if (profileRes.error) errors.push(profileRes.error);
    if (errors.length) setMessage({ kind: "err", text: errors[0] });

    // build history: per exercise, most recent session (any workout type) + which types/sections it was done in
    const map = new Map<string, HistoryItem>();
    for (const r of histRows) {
      const name = r.exercises?.name;
      const wd = r.workout_days;
      if (!name || !wd) continue;
      const key = name.toLowerCase();
      let h = map.get(key);
      if (!h) {
        h = { name, types: new Set(), sections: new Set(), last: null, recent: [] };
        map.set(key, h);
      }
      if (wd.type) h.types.add(wd.type);
      h.sections.add(r.section);
      const sets = (r.sets ?? []).filter(hasData);
      if (sets.length) h.recent.push({ date: wd.date, unit: r.unit, mode: r.mode, sets });
    }
    for (const h of map.values()) {
      h.recent = h.recent.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
      h.last = h.recent[0] ?? null;
    }

    // earlier days with their main exercises, newest first
    const byDate = new Map<string, { s: RecentSession; pos: Map<string, number> }>();
    for (const r of histRows) {
      const wd = r.workout_days;
      const name = r.exercises?.name;
      if (!wd || !name || r.section !== "main" || !(r.sets ?? []).some(hasData)) continue;
      let d = byDate.get(wd.date);
      if (!d) {
        d = { s: { date: wd.date, type: wd.type, effort: wd.effort, names: [] }, pos: new Map() };
        byDate.set(wd.date, d);
      }
      d.s.names.push(name);
      d.pos.set(name, r.position ?? 0);
    }
    setSessions(
      [...byDate.values()]
        .sort((a, b) => b.s.date.localeCompare(a.s.date))
        .slice(0, 60)
        .map(({ s: x, pos }) => ({ ...x, names: [...x.names].sort((a, b) => pos.get(a)! - pos.get(b)!) }))
    );
    setTags(
      new Map(((tagsRes.data ?? []) as { name: string; muscles: unknown }[]).map((t) => [t.name.toLowerCase(), toMuscles(t.muscles)]))
    );
    setHistory([...map.values()].sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? "")));
    const lh: LiftHistory = new Map();
    for (const r of [...histRows].sort((a, b) => (a.workout_days?.date ?? "").localeCompare(b.workout_days?.date ?? ""))) {
      if (r.exercises?.name && r.workout_days) addToHistory(lh, r.exercises.name, r.workout_days.date, r);
    }
    setLiftHist(lh);

    const day = dayRes.data;
    const rows = ((day?.day_exercises ?? []) as unknown as RawRow[]).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    );
    setType((day?.type as WorkoutType) ?? null);
    setDurationMin(day?.duration_min != null ? Number(day.duration_min) : null);
    setEffort(day?.effort != null ? Number(day.effort) : null);
    setLastSetAt(null);
    setItems(
      rows.map((r) => ({
        key: newKey(),
        name: r.exercises?.name ?? "Exercise",
        section: r.section,
        unit: r.unit,
        mode: r.mode,
        sets: r.sets ?? [],
      }))
    );

    const log = logRes.data;
    setWeightKg(log?.weight_kg != null ? Number(log.weight_kg) : null);
    setOldSleep({ bed: log?.bed_time ?? null, wake: log?.wake_time ?? null });
    setPrevWeight(prevWRes.data ? { date: prevWRes.data.date, kg: Number(prevWRes.data.weight_kg) } : null);

    setFoods((foodsRes.data ?? []).map(toFood));
    setMeals(toMealEntries((mealsRes.data ?? []) as MealRow[]));
    setPreviousMealDate(prevMealRes.data?.date ?? null);

    setSports(
      ((sportsRes.data ?? []) as SportRow[])
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ key: newKey(), sport: r.sport, minutes: Number(r.minutes), intensity: r.intensity, sets: r.sets ?? [] }))
    );
    setRuns(
      ((runsRes.data ?? []) as RunRow[])
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          key: newKey(),
          seconds: Number(r.seconds),
          distance: r.distance == null ? null : Number(r.distance),
          unit: r.distance_unit,
        }))
    );
    const seen = new Set<string>();
    setPastSports(
      ((pastSportsRes.data ?? []) as { sport: string }[])
        .map((r) => r.sport)
        .filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)))
    );
    setProfile(profileRes.profile);

    setDirtyParts({ workout: false, activities: false, meals: false, log: false });
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // rest timer
  useEffect(() => {
    if (lastSetAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastSetAt]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---------- workout mutations ----------
  const change = (fn: (prev: ExerciseEntry[]) => ExerciseEntry[]) => {
    setItems(fn);
    markDirty("workout");
  };

  const historyByName = useMemo(() => {
    const m = new Map<string, HistoryItem>();
    for (const h of history) m.set(h.name.toLowerCase(), h);
    return m;
  }, [history]);

  const addExercises = (names: string[], section: Section, opts?: { unit?: Unit; mode?: Mode }) => {
    change((prev) => {
      const existing = new Set(prev.filter((p) => p.section === section).map((p) => p.name.toLowerCase()));
      const added: ExerciseEntry[] = [];
      for (const raw of names) {
        const name = raw.trim();
        if (!name || existing.has(name.toLowerCase())) continue;
        existing.add(name.toLowerCase());
        const h = historyByName.get(name.toLowerCase());
        const last = h?.last;
        added.push({
          key: newKey(),
          name: h?.name ?? name,
          section,
          unit: last?.unit ?? opts?.unit ?? "kg",
          mode: last?.mode ?? opts?.mode ?? "reps",
          // one empty set per set last time; last time's numbers show as suggestions, ✓ copies them
          sets: (last?.sets.length ? last.sets : [null]).map(() => ({ reps: null, weight: null, seconds: null })),
        });
      }
      return [...prev, ...added];
    });
  };

  /** Saves an exercise's muscles right away (they belong to the exercise, not the day). */
  const tagExercise = async (name: string, muscles: Muscle[]) => {
    const key = name.trim().toLowerCase();
    const before = tags.get(key);
    setTags((prev) => new Map(prev).set(key, muscles));
    const { error } = await supabase().rpc("set_exercise_muscles", { p_name: name.trim(), p_muscles: muscles });
    if (error) {
      setTags((prev) => {
        const next = new Map(prev);
        if (before) next.set(key, before);
        else next.delete(key);
        return next;
      });
      setMessage({ kind: "err", text: `Couldn't save muscles: ${error.message}` });
    }
  };

  const updateItem = (key: string, next: ExerciseEntry) => change((prev) => prev.map((p) => (p.key === key ? next : p)));
  const removeItem = (key: string) => change((prev) => prev.filter((p) => p.key !== key));
  const moveItem = (key: string, dir: -1 | 1) =>
    change((prev) => {
      const list = [...prev];
      const i = list.findIndex((p) => p.key === key);
      const section = list[i].section;
      let j = i + dir;
      while (j >= 0 && j < list.length && list[j].section !== section) j += dir;
      if (j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });

  const pickType = (t: WorkoutType) => {
    setType((cur) => (cur === t ? null : t));
    markDirty("workout");
  };

  // ---------- meals / log mutations ----------
  const changeMeals = (next: MealEntry[]) => {
    setMeals(next);
    markDirty("meals");
  };

  const onFoodSaved = (f: Food) =>
    setFoods((prev) => {
      const list = prev.some((p) => p.id === f.id) ? prev.map((p) => (p.id === f.id ? f : p)) : [...prev, f];
      return list.sort((a, b) => a.name.localeCompare(b.name));
    });

  const copyPreviousMeals = async () => {
    if (!previousMealDate) return;
    const { data, error } = await supabase()
      .from("meal_items")
      .select("meal, position, food_id, quantity")
      .eq("date", previousMealDate);
    if (error) {
      setMessage({ kind: "err", text: error.message });
      return;
    }
    changeMeals(toMealEntries((data ?? []) as MealRow[]));
  };

  const weightShown =
    weightKg == null ? null : displayUnit === "kg" ? round2(weightKg) : round2(convert(weightKg, "kg", "lb"));
  const setWeightShown = (v: number | null) => {
    setWeightKg(v == null ? null : displayUnit === "kg" ? v : convert(v, "lb", "kg"));
    markDirty("log");
  };

  const changeSports = (next: SportEntry[]) => {
    setSports(next);
    markDirty("activities");
  };
  const changeRuns = (next: RunEntry[]) => {
    setRuns(next);
    markDirty("activities");
  };
  const pickEffort = (n: number) => {
    setEffort((cur) => (cur === n ? null : n));
    markDirty("workout");
  };
  const changeDuration = (v: number | null) => {
    setDurationMin(v && v > 0 ? v : null);
    markDirty("workout");
  };

  // ---------- save ----------
  const saveWorkout = async (t: WorkoutType | null, list: ExerciseEntry[], duration: number | null, eff: number | null) => {
    const payload = list.map((i) => ({
      name: i.name,
      section: i.section,
      unit: i.unit,
      mode: i.mode,
      sets: i.sets.map((s) => ({ reps: s.reps, weight: s.weight, seconds: s.seconds })),
    }));
    const { error } = await supabase().rpc("save_day", {
      p_date: date,
      p_type: t,
      p_items: payload,
      p_duration_min: duration,
      p_effort: eff,
    });
    return error?.message ?? null;
  };

  const saveActivities = async () => {
    const { error } = await supabase().rpc("save_activities", {
      p_date: date,
      p_sports: sports
        .filter((s) => s.sport.trim() && s.minutes && s.minutes > 0)
        .map((s) => ({
          sport: s.sport.trim(),
          minutes: s.minutes,
          intensity: s.intensity,
          sets: s.sets.filter((x) => x.us != null || x.them != null),
        })),
      p_runs: runs
        .filter((r) => r.seconds && r.seconds > 0)
        .map((r) => ({ seconds: r.seconds, distance: r.distance, distance_unit: r.unit })),
    });
    return error?.message ?? null;
  };

  const saveMeals = async () => {
    const payload = meals
      .filter((m) => m.quantity && m.quantity > 0)
      .map((m) => ({ food_id: m.foodId, meal: m.meal, quantity: m.quantity }));
    const { error } = await supabase().rpc("save_meals", { p_date: date, p_items: payload });
    return error?.message ?? null;
  };

  const saveLog = async () => {
    const { error } = await supabase().rpc("save_daily_log", {
      p_date: date,
      p_weight_kg: weightKg,
      p_bed_time: oldSleep.bed,
      p_wake_time: oldSleep.wake,
    });
    return error?.message ?? null;
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const parts = (Object.keys(dirtyParts) as (keyof typeof dirtyParts)[]).filter((p) => dirtyParts[p]);
    const results = await Promise.all(
      parts.map(async (p) => {
        const err =
          p === "workout"
            ? await saveWorkout(type, items, durationMin, effort)
            : p === "activities"
              ? await saveActivities()
              : p === "meals"
                ? await saveMeals()
                : await saveLog();
        return { p, err };
      })
    );
    setSaving(false);
    const failed = results.filter((r) => r.err);
    setDirtyParts((d) => {
      const next = { ...d };
      for (const r of results) if (!r.err) next[r.p] = false;
      return next;
    });
    if (failed.length) {
      setMessage({ kind: "err", text: failed[0].err! });
      return;
    }
    setMessage({ kind: "ok", text: "Saved" });
  };

  const clearWorkout = async () => {
    if (!confirm("Clear the weight training logged for this day?")) return;
    // the effort rating covers sports and runs too, so it stays if any are logged
    const keepEffort = sports.length || runs.length ? effort : null;
    setType(null);
    setItems([]);
    setDurationMin(null);
    setEffort(keepEffort);
    setSaving(true);
    const err = await saveWorkout(null, [], null, keepEffort);
    setSaving(false);
    if (err) {
      setMessage({ kind: "err", text: err });
      return;
    }
    setDirtyParts((d) => ({ ...d, workout: false }));
    setMessage({ kind: "ok", text: "Weight training cleared" });
  };

  const goto = (offset: number) => {
    if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
    const d = new Date(dateObj);
    d.setDate(d.getDate() + offset);
    router.push(`/day/${toISODate(d)}`);
  };

  const back = (e: React.MouseEvent) => {
    if (dirty && !confirm("You have unsaved changes. Leave anyway?")) e.preventDefault();
  };

  // ---------- derived ----------
  const mainItems = useMemo(() => items.filter((i) => i.section === "main"), [items]);
  const coreItems = useMemo(() => items.filter((i) => i.section === "core"), [items]);
  const totals = dayTotals(items, displayUnit);
  const info = typeInfo(type);
  const showMain = (type && type !== "rest") || mainItems.length > 0;

  const mainCandidates = useMemo(() => history.filter((h) => h.sections.has("main")), [history]);
  const mainTaken = useMemo(() => new Set(mainItems.map((i) => i.name.toLowerCase())), [mainItems]);

  const coreCandidates = useMemo(() => {
    const taken = new Set(coreItems.map((i) => i.name.toLowerCase()));
    return history.filter((h) => h.sections.has("core") && !taken.has(h.name.toLowerCase()));
  }, [history, coreItems]);

  const allNames = useMemo(() => history.map((h) => h.name), [history]);

  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const mealKcal = Math.round(sumEntries(meals, foodMap).kcal);

  const weightDelta =
    weightKg != null && prevWeight ? convert(weightKg, "kg", displayUnit) - convert(prevWeight.kg, "kg", displayUnit) : null;

  // calorie burn
  const kg = weightKg ?? prevWeight?.kg ?? FALLBACK_KG;
  const usingFallbackKg = weightKg == null && !prevWeight;
  const setCount = totals.sets + totals.coreSets;
  const weightsKcal = type === "rest" && !durationMin && setCount === 0 ? 0 : weightTrainingKcal(durationMin, setCount, kg);
  const sportsKcal = sports.reduce((a, s) => a + sportKcal(s, kg), 0);
  const runsKcal = runs.reduce((a, r) => a + runKcal(r, kg), 0);
  const exerciseKcalTotal = weightsKcal + sportsKcal + runsKcal;
  const baseline = baselineKcal(profile, kg, date);

  const training = trainingFor({ type, durationMin, exercises: items, sports, runs, rated: effort }, liftHist);
  const setsPlanned = items.reduce((a, i) => a + i.sets.length, 0);
  const restSec = lastSetAt == null ? null : Math.max(0, Math.floor((now - lastSetAt) / 1000));

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-zinc-400">Loading…</div>;
  }

  return (
    <main className="mx-auto max-w-2xl px-3 pb-32 pt-4 sm:px-6">
      {/* header */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link href="/" onClick={back} className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200">
          ‹ Calendar
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={() => goto(-1)} className="rounded-md px-2 py-1 text-lg hover:bg-zinc-200" aria-label="Previous day">
            ‹
          </button>
          <h1 className="text-center text-base font-semibold sm:text-lg">
            {dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </h1>
          <button onClick={() => goto(1)} className="rounded-md px-2 py-1 text-lg hover:bg-zinc-200" aria-label="Next day">
            ›
          </button>
        </div>
        <UnitToggle unit={displayUnit} onChange={setDisplayUnit} />
      </header>

      {/* morning weight */}
      <section className="mb-4 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Morning weight</div>
          {prevWeight && (
            <div className="text-xs text-zinc-500">
              Last: {round2(convert(prevWeight.kg, "kg", displayUnit)).toFixed(1)} {displayUnit} (
              {parseISODate(prevWeight.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })})
              {weightDelta != null && Math.abs(weightDelta) >= 0.05 && (
                <span className={`ml-1 font-medium ${weightDelta < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {weightDelta > 0 ? "+" : "−"}
                  {Math.abs(weightDelta).toFixed(1)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="w-24">
          <NumInput value={weightShown} onChange={setWeightShown} decimal placeholder="–" ariaLabel="Morning weight" />
        </div>
        <span className="w-5 text-sm text-zinc-500">{displayUnit}</span>
      </section>

      {/* tabs (only when there is more than one) */}
      {TABS.length > 1 && <nav
        className="mb-4 grid gap-1 rounded-lg bg-zinc-200 p-1 text-sm font-medium"
        style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
      >
        {TABS.map((t) => {
          const badge =
            t.value === "workout"
              ? exerciseKcalTotal >= 1
                ? `≈ ${Math.round(exerciseKcalTotal)} kcal`
                : ""
              : mealKcal
                ? `${mealKcal} kcal`
                : "";
          const partDirty =
            t.value === "workout" ? dirtyParts.workout || dirtyParts.activities : dirtyParts.meals;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => pickTab(t.value)}
              className={`rounded-md px-2 py-2 transition ${tab === t.value ? "bg-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {t.label}
              {partDirty && <span className="ml-1 text-amber-600">•</span>}
              {badge && <span className="block text-[10px] font-normal text-zinc-500">{badge}</span>}
            </button>
          );
        })}
      </nav>}

      {tab === "workout" && (
        <section className="mb-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Estimated calories burned by workouts</span>
            <span className="text-lg font-semibold">{Math.round(exerciseKcalTotal)} kcal</span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Weights {Math.round(weightsKcal)} · Sports {Math.round(sportsKcal)} · Running {Math.round(runsKcal)}
            {usingFallbackKg && <> · using {FALLBACK_KG} kg until you log your weight</>}
          </div>
        </section>
      )}

      {tab === "workout" && (training || effort != null) && (
        <section className="mb-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">How hard was today&apos;s training?</h2>
            {effort != null && (
              <span className="text-sm font-semibold">
                {effort}/10 · {effortLabel(effort)}
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-10 gap-1" role="radiogroup" aria-label="Effort, 1 to 10">
            {EFFORTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={effort === n}
                aria-label={`${n}, ${effortLabel(n)}`}
                onClick={() => pickEffort(n)}
                className={`rounded-md border py-2 text-sm font-semibold tabular-nums transition ${
                  effort === n
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : effort != null && n < effort
                      ? "border-orange-200 bg-orange-100 text-zinc-800"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            <span>Very easy</span>
            <span>Moderate</span>
            <span>All-out</span>
          </div>
          {training && (
            <p className="mt-1.5 text-xs text-zinc-600">
              {effort == null && (
                <>
                  Not rated yet. Estimated <b>{training.estimated.toFixed(1)}/10</b> from what you logged.{" "}
                </>
              )}
              Load: {effort ?? `≈ ${training.estimated.toFixed(1)}`} × {Math.round(training.minutes)} min ={" "}
              <b>{training.load.toLocaleString()}</b>
            </p>
          )}
        </section>
      )}

      {tab === "workout" && (
        <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200 text-sm font-medium">
          {WORKOUT_SUBS.map((s) => {
            const count = s.value === "weights" ? items.length : s.value === "sports" ? sports.length : runs.length;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => pickSub(s.value)}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${
                  sub === s.value ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {s.label}
                {count > 0 && <span className="ml-1 rounded-full bg-zinc-200 px-1.5 text-[10px] text-zinc-700">{count}</span>}
              </button>
            );
          })}
        </nav>
      )}

      {tab === "workout" && sub === "sports" && (
        <SportsTab items={sports} kg={kg} pastSports={pastSports} onChange={changeSports} />
      )}

      {tab === "workout" && sub === "running" && (
        <RunningTab items={runs} kg={kg} defaultUnit={displayUnit === "lb" ? "mi" : "km"} onChange={changeRuns} />
      )}

      {tab === "workout" && sub === "weights" && (
        <>
          {/* workout type */}
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Workout type</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {WORKOUT_TYPES.map((w) => (
                <button
                  key={w.value}
                  onClick={() => pickType(w.value)}
                  className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                    type === w.value ? `${w.color} border-transparent text-white` : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </section>

          {/* live summary, stays at the top while you scroll */}
          {items.length > 0 && (
            <section className="sticky top-0 z-10 -mx-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 bg-white/95 px-3 py-2 text-sm backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
              <span>
                <b className="tabular-nums">{setCount}</b>
                <span className="text-zinc-500">/{setsPlanned} sets</span>
              </span>
              <span>
                <b className="tabular-nums">{weightTrainingMinutes(durationMin, setCount)}</b>
                <span className="text-zinc-500"> min{durationMin ? "" : " (est.)"}</span>
              </span>
              {training && (
                <span>
                  <span className="text-zinc-500">Effort </span>
                  <b className="tabular-nums">{effort ?? `≈ ${training.estimated.toFixed(1)}`}</b>
                  <span className="text-zinc-500">/10</span>
                </span>
              )}
              {training && training.bests.length > 0 && (
                <span className="font-medium text-amber-700">
                  ★ {training.bests.length} new best{training.bests.length > 1 ? "s" : ""}
                </span>
              )}
              {totals.coreSets > 0 && (
                <span className="text-zinc-500">
                  Core {totals.coreSets}
                  {totals.coreSeconds ? ` · ${formatSeconds(totals.coreSeconds)}` : ""}
                </span>
              )}
              {restSec != null && restSec < 600 && (
                <button
                  type="button"
                  onClick={() => setLastSetAt(null)}
                  className="ml-auto rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white"
                  aria-label="Rest time since your last set. Tap to hide"
                >
                  Rest {Math.floor(restSec / 60)}:{String(restSec % 60).padStart(2, "0")}
                </button>
              )}
            </section>
          )}

          {/* duration (for calorie burn) */}
          <section className="mb-5 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Session length</div>
              <div className="text-xs text-zinc-500">
                {durationMin
                  ? `≈ ${Math.round(weightsKcal)} kcal burned`
                  : setCount
                    ? `Not entered: estimating ${weightTrainingMinutes(null, setCount)} min from your sets (≈ ${Math.round(weightsKcal)} kcal)`
                    : "Used to estimate calories burned"}
              </div>
            </div>
            <div className="w-20">
              <NumInput value={durationMin} onChange={changeDuration} decimal placeholder="–" ariaLabel="Session length in minutes" />
            </div>
            <span className="text-sm text-zinc-500">min</span>
          </section>

          {/* main workout */}
          {showMain && (
            <section className="mb-8">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                {info && type !== "rest" && <span className={`h-3 w-3 rounded-sm ${info.color}`} />}
                {info && type !== "rest" ? `${info.label} workout` : "Workout"}
              </h2>

              {/* exercises first, the add panel after them: a new exercise lands right above the panel */}
              <div className="space-y-3">
                {mainItems.map((it, idx) => (
                  <ExerciseCard
                    key={it.key}
                    entry={it}
                    last={historyByName.get(it.name.toLowerCase())?.last ?? null}
                    bestKg={bestBefore(liftHist, it.name)}
                    displayUnit={displayUnit}
                    onSetDone={() => setLastSetAt(Date.now())}
                    muscles={tags.get(it.name.toLowerCase()) ?? []}
                    onMuscles={(m) => tagExercise(it.name, m)}
                    onChange={(n) => updateItem(it.key, n)}
                    onRemove={() => removeItem(it.key)}
                    onMove={(d) => moveItem(it.key, d)}
                    isFirst={idx === 0}
                    isLast={idx === mainItems.length - 1}
                  />
                ))}
              </div>

              {type && type !== "rest" && (
                <div className={mainItems.length ? "mt-3" : ""}>
                  <MusclePicker
                    type={type}
                    date={date}
                    dayMuscles={TYPE_MUSCLES[type]}
                    candidates={mainCandidates}
                    tags={tags}
                    sessions={sessions}
                    taken={mainTaken}
                    displayUnit={displayUnit}
                    allNames={allNames}
                    defaultOpen={mainItems.length === 0}
                    onAdd={(names) => addExercises(names, "main")}
                    onAddNew={(name, unit, muscles) => {
                      tagExercise(name, muscles);
                      addExercises([name], "main", { unit, mode: "reps" });
                    }}
                    onTag={tagExercise}
                  />
                </div>
              )}
            </section>
          )}

          {/* core */}
          <section className="mb-8">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <span className="rounded bg-teal-100 px-1.5 text-xs font-bold text-teal-700">CORE</span> Core session
            </h2>
            <div className="space-y-3">
              {coreItems.map((it, idx) => (
                <ExerciseCard
                  key={it.key}
                  entry={it}
                  last={historyByName.get(it.name.toLowerCase())?.last ?? null}
                  bestKg={bestBefore(liftHist, it.name)}
                  displayUnit={displayUnit}
                  onSetDone={() => setLastSetAt(Date.now())}
                  allowMode
                  onChange={(n) => updateItem(it.key, n)}
                  onRemove={() => removeItem(it.key)}
                  onMove={(d) => moveItem(it.key, d)}
                  isFirst={idx === 0}
                  isLast={idx === coreItems.length - 1}
                />
              ))}
            </div>
            <div className={coreItems.length ? "mt-3" : ""}>
              <ExercisePicker
                title="Previous core exercises"
                candidates={coreCandidates}
                allNames={allNames}
                defaultOpen={false}
                allowMode
                onAdd={(names) => addExercises(names, "core")}
                onAddNew={(name, unit, mode) => addExercises([name], "core", { unit, mode })}
              />
            </div>
          </section>

          {(type || items.length > 0) && (
            <div className="text-center">
              <button onClick={clearWorkout} className="text-sm text-red-600 hover:underline">
                Clear weight training
              </button>
            </div>
          )}
        </>
      )}

      {tab === "meals" && MEALS_ENABLED && (
        <MealsTab
          foods={foods}
          items={meals}
          previousDate={previousMealDate}
          onChange={changeMeals}
          onFoodSaved={onFoodSaved}
          onCopyPrevious={copyPreviousMeals}
          burn={{ baseline, exercise: exerciseKcalTotal }}
        />
      )}

      {/* sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className={`text-sm ${message?.kind === "err" ? "text-red-600" : "text-zinc-500"}`}>
            {message ? message.text : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}
