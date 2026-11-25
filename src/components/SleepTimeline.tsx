"use client";

import { addDays } from "@/lib/daily";
import { SleepNight, formatClock, formatDuration, formatWallDate, wallMinutesBetween, wallTime, zoneNote } from "@/lib/sleep";

const ASLEEP = "#2a78d6";
const AWAKE = "#a9c9ef";
const HOURS = [
  { at: 0, label: "6 PM" },
  { at: 360, label: "12 AM" },
  { at: 720, label: "6 AM" },
  { at: 1080, label: "12 PM" },
  { at: 1440, label: "6 PM" },
];

/** One row per day, 6 PM the evening before to 6 PM. A sleep crossing 6 PM continues on the next row. */
export default function SleepTimeline({
  dates,
  nights,
  totals,
  highlight,
  onPick,
}: {
  /** newest first */
  dates: string[];
  nights: SleepNight[];
  /** minutes asleep per wake-up date */
  totals: Record<string, number | null>;
  highlight?: string | null;
  onPick?: (n: SleepNight) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex gap-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ASLEEP }} /> Asleep (est.)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AWAKE }} /> Falling asleep
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0" />
        <div className="relative h-4 min-w-0 flex-1 text-[10px] text-zinc-500">
          {HOURS.map((h) => (
            <span
              key={h.at}
              className={`absolute whitespace-nowrap ${h.at === 0 ? "" : h.at === 1440 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${(h.at / 1440) * 100}%` }}
            >
              {h.label}
            </span>
          ))}
        </div>
        <span className="w-14 shrink-0" />
      </div>
      <ul>
        {dates.map((date) => {
          const start = `${addDays(date, -1)}T18:00`;
          const total = totals[date];
          return (
            <li key={date} className={`flex items-center gap-2 rounded py-0.5 ${highlight === date ? "bg-amber-50" : ""}`}>
              <span className="w-20 shrink-0 truncate text-[11px] text-zinc-600">{formatWallDate(date)}</span>
              <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded bg-zinc-100">
                {[360, 720, 1080].map((m) => (
                  <span key={m} className="absolute inset-y-0 w-px bg-zinc-200" style={{ left: `${(m / 1440) * 100}%` }} />
                ))}
                {nights.map((n) => {
                  // starts at the local bedtime and is drawn at its real length
                  const from = wallMinutesBetween(start, n.bed);
                  const to = from + n.inBed;
                  if (to <= 0 || from >= 1440) return null;
                  const a = Math.max(0, from);
                  const b = Math.min(1440, to);
                  const awakeEnd = Math.min(b, Math.max(a, from + n.latency));
                  const awakePct = ((awakeEnd - a) / (b - a)) * 100;
                  const label = `${n.nap ? "Nap" : "Sleep"}, ${formatClock(wallTime(n.bed))}${zoneNote(n.bedAt, n.bedTz)} to ${formatClock(wallTime(n.wake))}${zoneNote(n.wakeAt, n.wakeTz)}, about ${formatDuration(n.asleep)} asleep`;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      disabled={!onPick}
                      onClick={() => onPick?.(n)}
                      title={label}
                      aria-label={label}
                      className="absolute inset-y-1 min-w-[6px] rounded"
                      style={{
                        left: `${(a / 1440) * 100}%`,
                        width: `${((b - a) / 1440) * 100}%`,
                        background: `linear-gradient(to right, ${AWAKE} ${awakePct}%, ${ASLEEP} ${awakePct}%)`,
                      }}
                    />
                  );
                })}
              </div>
              <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums">{total == null ? "–" : formatDuration(total)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
