"use client";

import { useEffect, useState } from "react";
import { DaySummary, addDays, sleepContextFor } from "@/lib/daily";
import {
  CYCLE_MIN,
  FALL_ASLEEP_MIN,
  SLEEP_GOALS as GOALS,
  SLEEP_GOAL_KEY as GOAL_KEY,
  asleepMinutes,
  estimateLatency,
  formatClock,
  formatDuration,
  fromMinutes,
  readSleepGoal,
  sleepMinutes,
  toMinutes,
} from "@/lib/sleep";

export default function SleepTab({
  date,
  bed,
  wake,
  history,
  onChange,
}: {
  date: string;
  bed: string;
  wake: string;
  /** summaries of the 7 days before `date` (sleep estimates, activity, eating) */
  history: Record<string, DaySummary>;
  onChange: (patch: { bed?: string; wake?: string }) => void;
}) {
  const [goal, setGoal] = useState(480);
  useEffect(() => setGoal(readSleepGoal()), []);
  const pickGoal = (g: number) => {
    setGoal(g);
    try {
      localStorage.setItem(GOAL_KEY, String(g));
    } catch {}
  };

  const inBed = sleepMinutes(bed, wake);
  const est = bed ? estimateLatency(bed, sleepContextFor(date, history, goal)) : null;
  const mins = inBed != null && est ? asleepMinutes(inBed, est.minutes) : null;
  const recent: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const m = history[addDays(date, -i)]?.sleepMin;
    if (m != null) recent.push(m);
  }
  const nights = mins != null ? [mins, ...recent] : recent;
  const avg = nights.length ? nights.reduce((a, b) => a + b, 0) / nights.length : null;
  const diff = mins != null ? mins - goal : null;

  const wakeMin = wake ? toMinutes(wake) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <h3 className="font-semibold">Last night</h3>
        <p className="mb-3 text-xs text-zinc-500">Bedtime = when you got in bed and stopped doing anything.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs text-zinc-500">Went to bed</span>
            <input
              type="time"
              value={bed}
              onChange={(e) => onChange({ bed: e.target.value })}
              className="block h-11 w-full min-w-0 appearance-none rounded-md border border-zinc-300 bg-white px-2 text-left text-base outline-none focus:border-zinc-900 [&::-webkit-date-and-time-value]:text-left"
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs text-zinc-500">Woke up</span>
            <input
              type="time"
              value={wake}
              onChange={(e) => onChange({ wake: e.target.value })}
              className="block h-11 w-full min-w-0 appearance-none rounded-md border border-zinc-300 bg-white px-2 text-left text-base outline-none focus:border-zinc-900 [&::-webkit-date-and-time-value]:text-left"
            />
          </label>
        </div>
        {(bed || wake) && (
          <button type="button" onClick={() => onChange({ bed: "", wake: "" })} className="mt-2 text-xs text-zinc-500 hover:underline">
            Clear times
          </button>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        <Box label="Asleep (est.)" value={mins != null ? `≈ ${formatDuration(mins)}` : "–"} />
        <Box label="Fell asleep" value={est && inBed != null ? `≈ ${formatClock(fromMinutes(toMinutes(bed) + est.minutes))}` : "–"} />
        <Box label={`Avg, last ${nights.length || 7} nights`} value={avg != null ? formatDuration(avg) : "–"} />
      </section>

      {est && inBed != null && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Time to fall asleep</h3>
            <span className="font-semibold">≈ {est.minutes} min</span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            In bed {formatDuration(inBed)} − {est.minutes} min to fall asleep = about {formatDuration(mins ?? 0)} asleep ({fmtCycles(mins ?? 0)} cycles).
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            <li className="flex justify-between gap-2 text-zinc-600">
              <span>Typical for most people</span>
              <span>15 min</span>
            </li>
            {est.factors.map((f) => (
              <li key={f.label} className="flex justify-between gap-2 text-zinc-600">
                <span>{f.label}</span>
                <span className={f.minutes > 0 ? "text-amber-700" : "text-emerald-700"}>
                  {f.minutes > 0 ? "+" : "−"}
                  {Math.abs(f.minutes)} min
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-400">
            An educated guess from the day before (workouts and calories), the night before, and your usual bedtime. Log yesterday&apos;s workouts and meals
            to sharpen it.
          </p>
        </section>
      )}

      {diff != null && (
        <p className={`rounded-lg px-3 py-2 text-sm ${diff >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {diff >= 0
            ? `You hit your ${formatDuration(goal)} goal${diff > 0 ? ` with ${formatDuration(diff)} to spare` : ""}.`
            : `${formatDuration(-diff)} short of your ${formatDuration(goal)} goal.`}
        </p>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Sleep goal</h3>
          <div className="flex rounded-md border border-zinc-300 bg-white text-xs">
            {GOALS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => pickGoal(g)}
                className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${goal === g ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              >
                {formatDuration(g)}
              </button>
            ))}
          </div>
        </div>
        {wakeMin != null ? (
          <div className="text-sm text-zinc-700">
            <p>
              To wake at <b>{formatClock(wake)}</b> with {formatDuration(goal)} of sleep, be in bed by{" "}
              <b>{formatClock(fromMinutes(wakeMin - goal))}</b> tonight.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Waking at the end of a {CYCLE_MIN}-minute cycle feels easier. Allowing about {FALL_ASLEEP_MIN} minutes to fall asleep, good times to be in bed are:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[6, 5, 4].map((n) => (
                <span key={n} className="rounded-md bg-zinc-100 px-2 py-1 text-xs">
                  <b>{formatClock(fromMinutes(wakeMin - FALL_ASLEEP_MIN - n * CYCLE_MIN))}</b> · {n} cycles ({formatDuration(n * CYCLE_MIN)})
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Enter your wake-up time to see when to go to bed tonight.</p>
        )}
      </section>
    </div>
  );
}

function fmtCycles(mins: number) {
  return String(Math.round((mins / CYCLE_MIN) * 10) / 10);
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-1 py-2">
      <div className="text-base font-semibold sm:text-lg">{value}</div>
      <div className="text-[10px] text-zinc-500 sm:text-[11px]">{label}</div>
    </div>
  );
}
