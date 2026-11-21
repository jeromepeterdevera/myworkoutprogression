"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import UnitToggle from "@/components/UnitToggle";
import { signOut } from "@/lib/useAuth";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import { fmt1, macrosFor, toFood } from "@/lib/nutrition";
import { formatDuration, sleepMinutes } from "@/lib/sleep";
import {
  DayExerciseRow,
  WORKOUT_TYPES,
  WorkoutType,
  convert,
  dayTotals,
  formatNumber,
  toISODate,
  typeInfo,
} from "@/lib/workout";

interface DayRow {
  date: string;
  type: WorkoutType | null;
  day_exercises: DayExerciseRow[];
}

interface LogRow {
  date: string;
  weight_kg: number | null;
  bed_time: string | null;
  wake_time: string | null;
}

interface MealSum {
  kcal: number;
  protein: number;
}

type View = "workout" | "weight" | "meals" | "sleep";
const VIEWS: { value: View; label: string }[] = [
  { value: "workout", label: "Workout" },
  { value: "weight", label: "Weight" },
  { value: "meals", label: "Meals" },
  { value: "sleep", label: "Sleep" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_KEY = "calendar-month";
const VIEW_KEY = "calendar-view";

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, DayRow>>({});
  const [logs, setLogs] = useState<Record<string, LogRow>>({});
  const [mealSums, setMealSums] = useState<Record<string, MealSum>>({});
  const [view, setView] = useState<View>("workout");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useDisplayUnit();

  // remember the month and view you were looking at when coming back from a day page
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(MONTH_KEY);
      if (saved) {
        const [y, m] = saved.split("-").map(Number);
        setMonth(new Date(y, m - 1, 1));
      }
      const v = sessionStorage.getItem(VIEW_KEY);
      if (VIEWS.some((x) => x.value === v)) setView(v as View);
    } catch {}
  }, []);

  const pickView = (v: View) => {
    setView(v);
    try {
      sessionStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const grid = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    // drop the last row if it is entirely next month
    if (cells[35].getMonth() !== month.getMonth()) cells.splice(35);
    return cells;
  }, [month]);

  useEffect(() => {
    try {
      sessionStorage.setItem(MONTH_KEY, `${month.getFullYear()}-${month.getMonth() + 1}`);
    } catch {}
    let cancelled = false;
    setLoading(true);
    setError(null);
    const from = toISODate(grid[0]);
    const to = toISODate(grid[grid.length - 1]);
    const sb = supabase();
    Promise.all([
      sb.from("workout_days").select("date, type, day_exercises(section, unit, mode, sets)").gte("date", from).lte("date", to),
      sb.from("daily_logs").select("date, weight_kg, bed_time, wake_time").gte("date", from).lte("date", to),
      sb.from("meal_items").select("date, quantity, foods(*)").gte("date", from).lte("date", to),
    ]).then(([w, l, m]) => {
      if (cancelled) return;
      const err = w.error ?? l.error ?? m.error;
      if (err) setError(err.message);

      const dayMap: Record<string, DayRow> = {};
      for (const r of (w.data ?? []) as DayRow[]) dayMap[r.date] = r;
      setDays(dayMap);

      const logMap: Record<string, LogRow> = {};
      for (const r of (l.data ?? []) as LogRow[]) {
        logMap[r.date] = { ...r, weight_kg: r.weight_kg == null ? null : Number(r.weight_kg) };
      }
      setLogs(logMap);

      const sums: Record<string, MealSum> = {};
      type MealJoin = { date: string; quantity: number; foods: Record<string, unknown> | null };
      for (const r of (m.data ?? []) as unknown as MealJoin[]) {
        if (!r.foods) continue;
        const mm = macrosFor(toFood(r.foods), Number(r.quantity));
        const cur = (sums[r.date] ??= { kcal: 0, protein: 0 });
        cur.kcal += mm.kcal;
        cur.protein += mm.protein;
      }
      setMealSums(sums);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [grid, month]);

  const todayISO = toISODate(new Date());
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

  const stats = useMemo((): { label: string; value: string }[] => {
    const inMonth = <T,>(rec: Record<string, T>) =>
      Object.entries(rec)
        .filter(([d]) => d.startsWith(monthPrefix))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v);

    if (view === "weight") {
      const ws = inMonth(logs)
        .map((l) => l.weight_kg)
        .filter((w): w is number => w != null)
        .map((w) => convert(w, "kg", unit));
      const change = ws.length > 1 ? ws[ws.length - 1] - ws[0] : null;
      return [
        { label: `Latest (${unit})`, value: ws.length ? ws[ws.length - 1].toFixed(1) : "–" },
        {
          label: `Change (${unit})`,
          value: change == null ? "–" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}`,
        },
        { label: "Days weighed", value: String(ws.length) },
      ];
    }

    if (view === "meals") {
      const ms = inMonth(mealSums);
      const avg = (f: (m: MealSum) => number) => (ms.length ? ms.reduce((a, m) => a + f(m), 0) / ms.length : null);
      const k = avg((m) => m.kcal);
      const p = avg((m) => m.protein);
      return [
        { label: "Avg kcal / day", value: k == null ? "–" : String(Math.round(k)) },
        { label: "Avg protein / day", value: p == null ? "–" : `${Math.round(p)} g` },
        { label: "Days logged", value: String(ms.length) },
      ];
    }

    if (view === "sleep") {
      const ss = inMonth(logs)
        .map((l) => sleepMinutes(l.bed_time, l.wake_time))
        .filter((m): m is number => m != null);
      return [
        { label: "Avg sleep", value: ss.length ? formatDuration(ss.reduce((a, b) => a + b, 0) / ss.length) : "–" },
        { label: "Shortest", value: ss.length ? formatDuration(Math.min(...ss)) : "–" },
        { label: "Nights logged", value: String(ss.length) },
      ];
    }

    let sessions = 0;
    let volume = 0;
    let core = 0;
    for (const d of inMonth(days)) {
      const t = dayTotals(d.day_exercises, unit);
      if (d.type && d.type !== "rest") sessions++;
      if (t.coreSets > 0) core++;
      volume += t.volume;
    }
    return [
      { label: "Sessions", value: String(sessions) },
      { label: `Volume (${unit})`, value: formatNumber(volume) },
      { label: "Core days", value: String(core) },
    ];
  }, [view, days, logs, mealSums, monthPrefix, unit]);

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <main className="mx-auto max-w-3xl px-3 pb-10 pt-4 sm:px-6">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-md px-3 py-2 text-xl hover:bg-zinc-200" aria-label="Previous month">
            ‹
          </button>
          <h1 className="min-w-[10ch] text-center text-lg font-semibold sm:text-xl">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h1>
          <button onClick={() => shift(1)} className="rounded-md px-3 py-2 text-xl hover:bg-zinc-200" aria-label="Next month">
            ›
          </button>
        </div>
        <div className="flex items-center gap-2">
          <UnitToggle unit={unit} onChange={setUnit} />
          <button onClick={signOut} className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200">
            Sign out
          </button>
        </div>
      </header>

      <nav className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-zinc-200 p-1 text-sm font-medium">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => pickView(v.value)}
            className={`rounded-md py-1.5 transition ${view === v.value ? "bg-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        {stats.map((st) => (
          <Stat key={st.label} label={st.label} value={st.value} />
        ))}
      </div>

      {error && <p className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium text-zinc-500">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className={`grid grid-cols-7 ${loading ? "opacity-60" : ""}`}>
          {grid.map((d) => {
            const iso = toISODate(d);
            const row = days[iso];
            const inMonth = d.getMonth() === month.getMonth();
            const info = typeInfo(row?.type);
            const t = row ? dayTotals(row.day_exercises, unit) : null;
            const log = logs[iso];
            const meal = mealSums[iso];
            const sleep = log ? sleepMinutes(log.bed_time, log.wake_time) : null;
            return (
              <Link
                key={iso}
                href={`/day/${iso}`}
                className={`flex min-h-[78px] flex-col gap-1 border-b border-r border-zinc-100 p-1 text-left transition hover:bg-zinc-50 sm:min-h-[96px] sm:p-1.5 ${
                  inMonth ? "" : "bg-zinc-50/70 text-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      iso === todayISO ? "bg-zinc-900 font-semibold text-white" : ""
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {view === "workout" && t && t.coreSets > 0 && (
                    <span className="rounded bg-teal-100 px-1 text-[9px] font-bold text-teal-700 sm:text-[10px]" title="Core done">
                      CORE
                    </span>
                  )}
                </div>

                {view === "workout" && (
                  <>
                    {info && (
                      <span className={`truncate rounded px-1 text-[9px] font-bold text-white sm:text-[11px] ${info.color}`}>
                        {info.short}
                      </span>
                    )}
                    {t && t.volume > 0 && (
                      <span className="text-[10px] leading-tight text-zinc-700 sm:text-xs">
                        <span className="font-semibold">{formatNumber(t.volume)}</span>
                        <span className="hidden sm:inline"> {unit}</span>
                      </span>
                    )}
                    {t && t.sets > 0 && (
                      <span className="text-[9px] leading-tight text-zinc-500 sm:text-[11px]">{t.sets} sets</span>
                    )}
                  </>
                )}

                {view === "weight" && log?.weight_kg != null && (
                  <span className="text-[11px] leading-tight text-zinc-800 sm:text-sm">
                    <span className="font-semibold">{convert(log.weight_kg, "kg", unit).toFixed(1)}</span>
                    <span className="hidden text-zinc-500 sm:inline"> {unit}</span>
                  </span>
                )}

                {view === "meals" && meal && (
                  <>
                    <span className="text-[11px] font-semibold leading-tight text-zinc-800 sm:text-sm">{Math.round(meal.kcal)}</span>
                    <span className="text-[9px] leading-tight text-zinc-500 sm:text-[11px]">
                      kcal<span className="hidden sm:inline"> · P {fmt1(meal.protein)}g</span>
                    </span>
                  </>
                )}

                {view === "sleep" && sleep != null && (
                  <span
                    className={`self-start rounded px-1 text-[10px] font-semibold leading-tight sm:text-xs ${
                      sleep >= 420
                        ? "bg-emerald-100 text-emerald-800"
                        : sleep >= 360
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {formatDuration(sleep)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {view === "workout" && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
          {WORKOUT_TYPES.map((w) => (
            <span key={w.value} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${w.color}`} />
              {w.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="rounded bg-teal-100 px-1 text-[9px] font-bold text-teal-700">CORE</span> Core done
          </span>
        </div>
      )}

      {view === "sleep" && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="rounded bg-emerald-100 px-1 text-emerald-800">7h or more</span>
          <span className="rounded bg-amber-100 px-1 text-amber-800">6–7h</span>
          <span className="rounded bg-rose-100 px-1 text-rose-800">under 6h</span>
        </div>
      )}

      <div className="mt-5 text-center">
        <Link href={`/day/${todayISO}`} className="inline-block rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700">
          Log today
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
