"use client";

import { useEffect, useState } from "react";
import { CYCLE_MIN, FALL_ASLEEP_MIN, formatClock, formatDuration, fromMinutes, sleepMinutes, toMinutes } from "@/lib/sleep";

const GOAL_KEY = "sleep-goal-min";
const GOALS = [420, 450, 480, 510, 540];

export default function SleepTab({
  bed,
  wake,
  recent,
  onChange,
}: {
  bed: string;
  wake: string;
  /** sleep minutes for the nights before this one (most recent first, up to 6) */
  recent: number[];
  onChange: (patch: { bed?: string; wake?: string }) => void;
}) {
  const [goal, setGoal] = useState(480);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(GOAL_KEY));
      if (GOALS.includes(v)) setGoal(v);
    } catch {}
  }, []);
  const pickGoal = (g: number) => {
    setGoal(g);
    try {
      localStorage.setItem(GOAL_KEY, String(g));
    } catch {}
  };

  const mins = sleepMinutes(bed, wake);
  const nights = mins != null ? [mins, ...recent] : recent;
  const avg = nights.length ? nights.reduce((a, b) => a + b, 0) / nights.length : null;
  const diff = mins != null ? mins - goal : null;

  const wakeMin = wake ? toMinutes(wake) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <h3 className="mb-3 font-semibold">Last night</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">In bed, stopped doing anything</span>
            <input
              type="time"
              value={bed}
              onChange={(e) => onChange({ bed: e.target.value })}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-base outline-none focus:border-zinc-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-500">Woke up</span>
            <input
              type="time"
              value={wake}
              onChange={(e) => onChange({ wake: e.target.value })}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-base outline-none focus:border-zinc-900"
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
        <Box label="Slept" value={mins != null ? formatDuration(mins) : "–"} />
        <Box label="Sleep cycles" value={mins != null ? `≈ ${fmtCycles(mins)}` : "–"} />
        <Box label={`Avg, last ${nights.length || 7} nights`} value={avg != null ? formatDuration(avg) : "–"} />
      </section>

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
