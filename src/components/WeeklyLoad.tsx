"use client";

import { DaySummary } from "@/lib/daily";
import { parseISODate } from "@/lib/workout";

/** Training load (effort × minutes) per calendar week, as small bars. */
export default function WeeklyLoad({ grid, days, today }: { grid: string[]; days: Record<string, DaySummary>; today: string }) {
  const weeks: { start: string; load: number; active: number; current: boolean }[] = [];
  for (let i = 0; i < grid.length; i += 7) {
    const week = grid.slice(i, i + 7);
    let load = 0;
    let active = 0;
    for (const date of week) {
      const t = days[date]?.training;
      if (t) {
        load += t.load;
        active++;
      }
    }
    weeks.push({ start: week[0], load, active, current: week.includes(today) });
  }
  const max = Math.max(...weeks.map((w) => w.load), 1);
  const label = (iso: string) => parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 pb-2 pt-2">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-xs font-medium text-zinc-600">Training load per week</h2>
        <span className="text-[10px] text-zinc-500">effort × minutes</span>
      </div>
      <div className="flex items-end gap-2">
        {weeks.map((w) => {
          const text = `Week of ${label(w.start)}: load ${w.load.toLocaleString()} over ${w.active} active day${w.active === 1 ? "" : "s"}`;
          return (
            <div key={w.start} className="flex min-w-0 flex-1 flex-col items-center" title={text} aria-label={text}>
              <span className="text-[10px] tabular-nums text-zinc-600">{w.load ? w.load.toLocaleString() : "–"}</span>
              <div className="flex h-10 w-full items-end">
                <div
                  className={`w-full rounded-t ${w.current ? "bg-orange-500" : "bg-orange-300"}`}
                  style={{ height: w.load ? `${Math.max(6, (w.load / max) * 100)}%` : 0 }}
                />
              </div>
              <span className={`mt-0.5 border-t border-zinc-200 pt-0.5 text-[10px] ${w.current ? "font-semibold text-zinc-800" : "text-zinc-500"} w-full truncate text-center`}>
                {label(w.start)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
