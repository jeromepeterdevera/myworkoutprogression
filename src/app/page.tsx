"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import UnitToggle from "@/components/UnitToggle";
import { signOut } from "@/lib/useAuth";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import {
  DayExerciseRow,
  WORKOUT_TYPES,
  WorkoutType,
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_KEY = "calendar-month";

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, DayRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useDisplayUnit();

  // remember the month you were looking at when coming back from a day page
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(MONTH_KEY);
      if (saved) {
        const [y, m] = saved.split("-").map(Number);
        setMonth(new Date(y, m - 1, 1));
      }
    } catch {}
  }, []);

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
    supabase()
      .from("workout_days")
      .select("date, type, day_exercises(section, unit, mode, sets)")
      .gte("date", toISODate(grid[0]))
      .lte("date", toISODate(grid[grid.length - 1]))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        const map: Record<string, DayRow> = {};
        for (const r of (data ?? []) as DayRow[]) map[r.date] = r;
        setDays(map);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [grid, month]);

  const todayISO = toISODate(new Date());

  const monthStats = useMemo(() => {
    let sessions = 0;
    let volume = 0;
    let core = 0;
    for (const [date, d] of Object.entries(days)) {
      if (!date.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`)) continue;
      const t = dayTotals(d.day_exercises, unit);
      if (d.type && d.type !== "rest") sessions++;
      if (t.coreSets > 0) core++;
      volume += t.volume;
    }
    return { sessions, volume, core };
  }, [days, month, unit]);

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

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Sessions" value={String(monthStats.sessions)} />
        <Stat label={`Volume (${unit})`} value={formatNumber(monthStats.volume)} />
        <Stat label="Core days" value={String(monthStats.core)} />
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
                  {t && t.coreSets > 0 && (
                    <span className="rounded bg-teal-100 px-1 text-[9px] font-bold text-teal-700 sm:text-[10px]" title="Core done">
                      CORE
                    </span>
                  )}
                </div>
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
              </Link>
            );
          })}
        </div>
      </div>

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
