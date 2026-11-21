"use client";

import NumInput from "./NumInput";
import { newKey } from "@/lib/workout";
import { KM_PER_MI, RunEntry, UNKNOWN_RUN_MET, formatHms, formatPace, runKcal } from "@/lib/activity";

export default function RunningTab({
  items,
  kg,
  defaultUnit,
  onChange,
}: {
  items: RunEntry[];
  kg: number;
  defaultUnit: "km" | "mi";
  onChange: (items: RunEntry[]) => void;
}) {
  const update = (key: string, patch: Partial<RunEntry>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = () => onChange([...items, { key: newKey(), seconds: null, distance: null, unit: defaultUnit }]);
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));

  return (
    <div className="space-y-3">
      {items.map((it, idx) => {
        const sec = it.seconds ?? 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const setPart = (part: "h" | "m" | "s", v: number | null) => {
          const parts = { h, m, s, [part]: v ?? 0 };
          const total = parts.h * 3600 + parts.m * 60 + parts.s;
          update(it.key, { seconds: total > 0 ? total : null });
        };
        const kcal = runKcal(it, kg);
        const speed =
          it.seconds && it.distance ? it.distance / (it.seconds / 3600) : null;
        const changeUnit = (u: "km" | "mi") => {
          if (u === it.unit) return;
          const d = it.distance == null ? null : Math.round((u === "mi" ? it.distance / KM_PER_MI : it.distance * KM_PER_MI) * 100) / 100;
          update(it.key, { unit: u, distance: d });
        };
        return (
          <div key={it.key} className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Run {items.length > 1 ? idx + 1 : ""}</h3>
              <button
                type="button"
                onClick={() => remove(it.key)}
                className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                aria-label="Remove run"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <span className="mb-1 block text-xs text-zinc-500">Duration (h : min : sec)</span>
                <div className="flex items-center gap-1">
                  <NumInput value={h || null} onChange={(v) => setPart("h", v)} placeholder="0" ariaLabel="Hours" />
                  <span className="text-zinc-400">:</span>
                  <NumInput value={sec ? m : null} onChange={(v) => setPart("m", v)} placeholder="min" ariaLabel="Minutes" />
                  <span className="text-zinc-400">:</span>
                  <NumInput value={sec ? s : null} onChange={(v) => setPart("s", v)} placeholder="sec" ariaLabel="Seconds" />
                </div>
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-xs text-zinc-500">Distance (optional)</span>
                <div className="flex items-center gap-1">
                  <NumInput value={it.distance} onChange={(v) => update(it.key, { distance: v && v > 0 ? v : null })} decimal ariaLabel="Distance" />
                  <div className="flex shrink-0 rounded-md border border-zinc-300 bg-white text-xs">
                    {(["km", "mi"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => changeUnit(u)}
                        className={`px-2 py-2 first:rounded-l-md last:rounded-r-md ${it.unit === u ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Box label="Time" value={it.seconds ? formatHms(it.seconds) : "–"} />
              <Box label="Pace" value={it.seconds && it.distance ? formatPace(it.seconds, it.distance, it.unit) : "–"} />
              <Box label="kcal burned" value={kcal ? `≈ ${Math.round(kcal)}` : "–"} />
            </div>
            {speed != null && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                Average speed {Math.round(speed * 10) / 10} {it.unit}/h
              </p>
            )}
            {it.seconds && !it.distance ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                Add the distance for a better estimate. Without it, a steady jog pace is assumed ({UNKNOWN_RUN_MET} MET).
              </p>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        + Add run
      </button>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-1 py-2">
      <div className="text-sm font-semibold sm:text-base">{value}</div>
      <div className="text-[10px] text-zinc-500 sm:text-[11px]">{label}</div>
    </div>
  );
}
