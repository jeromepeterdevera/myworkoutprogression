"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import UnitToggle from "@/components/UnitToggle";
import AppNav from "@/components/AppNav";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import { formatDuration } from "@/lib/sleep";
import { MEALS_ENABLED } from "@/lib/features";
import { KM_PER_MI, profileComplete } from "@/lib/activity";
import { DaySummary, loadRange } from "@/lib/daily";
import { WORKOUT_TYPES, convert, dayTotals, formatNumber, toISODate, typeInfo } from "@/lib/workout";

type View = "workout" | "weight" | "calories" | "sleep";
const VIEWS: { value: View; label: string }[] = [
  { value: "workout", label: "Workout" },
  { value: "weight", label: "Weight" },
  { value: "calories", label: "Calories" },
  { value: "sleep", label: "Sleep" },
].filter((v) => MEALS_ENABLED || v.value !== "calories") as { value: View; label: string }[];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_KEY = "calendar-month";
const VIEW_KEY = "calendar-view";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [days, setDays] = useState<Record<string, DaySummary>>({});
  const [hasProfile, setHasProfile] = useState(true);
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
      if (v === "meals" && MEALS_ENABLED) setView("calories");
      else if (VIEWS.some((x) => x.value === v)) setView(v as View);
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
    loadRange(toISODate(grid[0]), toISODate(grid[grid.length - 1])).then((res) => {
      if (cancelled) return;
      setError(res.error);
      setDays(res.days);
      setHasProfile(profileComplete(res.profile));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [grid, month]);

  const todayISO = toISODate(new Date());
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const distUnit = unit === "lb" ? "mi" : "km";

  const stats = useMemo((): { label: string; value: string }[] => {
    const inMonth = Object.values(days)
      .filter((d) => d.date.startsWith(monthPrefix))
      .sort((a, b) => a.date.localeCompare(b.date));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    if (view === "weight") {
      const ws = inMonth.flatMap((d) => (d.weightKg != null ? [convert(d.weightKg, "kg", unit)] : []));
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

    if (view === "calories") {
      const eaten = avg(inMonth.flatMap((d) => (d.intake != null ? [d.intake] : [])));
      const bal = inMonth.flatMap((d) => (d.balance != null ? [d.balance] : []));
      const avgBal = avg(bal);
      const workoutBurn = avg(inMonth.filter((d) => d.exerciseKcal > 0).map((d) => d.exerciseKcal));
      return [
        { label: "Avg eaten / day", value: eaten == null ? "–" : Math.round(eaten).toLocaleString() },
        { label: "Avg workout burn", value: workoutBurn == null ? "–" : Math.round(workoutBurn).toLocaleString() },
        {
          label: avgBal == null ? "Avg balance" : avgBal > 0 ? "Avg surplus" : "Avg deficit",
          value: avgBal == null ? "–" : signed(avgBal),
        },
      ];
    }

    if (view === "sleep") {
      const ss = inMonth.flatMap((d) => (d.sleepMin != null ? [d.sleepMin] : []));
      const a = avg(ss);
      return [
        { label: "Avg sleep", value: a == null ? "–" : formatDuration(a) },
        { label: "Shortest", value: ss.length ? formatDuration(Math.min(...ss)) : "–" },
        { label: "Nights logged", value: String(ss.length) },
      ];
    }

    let sessions = 0;
    let volume = 0;
    let km = 0;
    for (const d of inMonth) {
      const t = dayTotals(d.exercises, unit);
      if ((d.workoutType && d.workoutType !== "rest") || d.sports.length || d.runs.length) sessions++;
      volume += t.volume;
      for (const r of d.runs) if (r.distance) km += r.unit === "mi" ? r.distance * KM_PER_MI : r.distance;
    }
    return [
      { label: "Active days", value: String(sessions) },
      { label: `Volume (${unit})`, value: formatNumber(volume) },
      { label: `Run (${distUnit})`, value: km ? (distUnit === "mi" ? km / KM_PER_MI : km).toFixed(1) : "–" },
    ];
  }, [view, days, monthPrefix, unit, distUnit]);

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <main className="mx-auto max-w-3xl px-3 pb-10 pt-4 sm:px-6">
      <AppNav current="calendar" />

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
        <UnitToggle unit={unit} onChange={setUnit} />
      </header>

      <nav
        className="mb-3 grid gap-1 rounded-lg bg-zinc-200 p-1 text-sm font-medium"
        style={{ gridTemplateColumns: `repeat(${VIEWS.length}, minmax(0, 1fr))` }}
      >
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

      {view === "calories" && !hasProfile && !loading && (
        <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
          Fill in your{" "}
          <Link href="/profile" className="font-medium underline">
            profile
          </Link>{" "}
          to see a daily surplus or deficit. Until then the calendar shows calories eaten.
        </p>
      )}

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
            const day = days[iso];
            const inMonth = d.getMonth() === month.getMonth();
            const info = typeInfo(day?.workoutType);
            const t = day ? dayTotals(day.exercises, unit) : null;
            const runDist = day?.runs.reduce((a, r) => {
              if (!r.distance) return a;
              const km = r.unit === "mi" ? r.distance * KM_PER_MI : r.distance;
              return a + (distUnit === "mi" ? km / KM_PER_MI : km);
            }, 0);
            return (
              <Link
                key={iso}
                href={`/day/${iso}`}
                className={`flex min-h-[84px] min-w-0 flex-col gap-0.5 border-b border-r border-zinc-100 p-1 text-left transition hover:bg-zinc-50 sm:min-h-[100px] sm:p-1.5 ${
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

                {view === "workout" && day && (
                  <>
                    {info && (
                      <span className={`truncate rounded px-1 text-[9px] font-bold text-white sm:text-[11px] ${info.color}`}>
                        {info.short}
                      </span>
                    )}
                    {day.sports.length > 0 && (
                      <span
                        className="truncate rounded bg-fuchsia-600 px-1 text-[9px] font-bold text-white sm:text-[11px]"
                        title={day.sports.join(", ")}
                      >
                        {day.sports.length > 1 ? `${day.sports.length} SPORTS` : day.sports[0].toUpperCase()}
                      </span>
                    )}
                    {day.runs.length > 0 && (
                      <span className="truncate rounded bg-lime-600 px-1 text-[9px] font-bold text-white sm:text-[11px]">
                        RUN{runDist ? ` ${runDist.toFixed(1)}` : ""}
                      </span>
                    )}
                    {t && t.volume > 0 && (
                      <span className="text-[10px] leading-tight text-zinc-700 sm:text-xs">
                        <span className="font-semibold">{formatNumber(t.volume)}</span>
                        <span className="hidden sm:inline"> {unit}</span>
                      </span>
                    )}
                    {day.exerciseKcal >= 1 && (
                      <span className="text-[9px] leading-tight text-orange-700 sm:text-[11px]">
                        {Math.round(day.exerciseKcal)}
                        <span className="hidden sm:inline"> kcal</span>
                      </span>
                    )}
                  </>
                )}

                {view === "weight" && day?.weightKg != null && (
                  <span className="text-[11px] leading-tight text-zinc-800 sm:text-sm">
                    <span className="font-semibold">{convert(day.weightKg, "kg", unit).toFixed(1)}</span>
                    <span className="hidden text-zinc-500 sm:inline"> {unit}</span>
                  </span>
                )}

                {view === "calories" && day && (day.intake != null || day.exerciseKcal >= 1) && (
                  <>
                    {day.balance != null && (
                      <span
                        className={`self-start rounded px-1 text-[10px] font-semibold leading-tight sm:text-xs ${
                          day.balance > 0 ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                        }`}
                        title={day.balance > 0 ? "Surplus" : "Deficit"}
                      >
                        {signed(day.balance)}
                      </span>
                    )}
                    {day.intake != null && (
                      <span className="text-[9px] leading-tight text-zinc-600 sm:text-[11px]">
                        <span className="sm:hidden">{Math.round(day.intake)}</span>
                        <span className="hidden sm:inline">eaten {Math.round(day.intake)}</span>
                      </span>
                    )}
                    {day.exerciseKcal >= 1 && (
                      <span className="hidden text-[11px] leading-tight text-orange-700 sm:inline">
                        workout {Math.round(day.exerciseKcal)}
                      </span>
                    )}
                  </>
                )}

                {view === "sleep" && day?.sleepMin != null && (
                  <span
                    className={`self-start rounded px-1 text-[10px] font-semibold leading-tight sm:text-xs ${
                      day.sleepMin >= 420
                        ? "bg-emerald-100 text-emerald-800"
                        : day.sleepMin >= 360
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {formatDuration(day.sleepMin)}
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
            <span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-600" /> Sports
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-lime-600" /> Run ({distUnit})
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded bg-teal-100 px-1 text-[9px] font-bold text-teal-700">CORE</span> Core done
          </span>
          <span className="text-orange-700">Orange number = kcal burned by workouts</span>
        </div>
      )}

      {view === "calories" && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
          <span>
            <span className="rounded bg-blue-100 px-1 text-blue-800">−</span> deficit
          </span>
          <span>
            <span className="rounded bg-red-100 px-1 text-red-800">+</span> surplus
          </span>
          <span>Balance = eaten − (body burn + workouts). Shown on days you logged meals.</span>
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
