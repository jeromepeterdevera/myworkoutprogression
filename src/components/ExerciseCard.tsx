"use client";

import NumInput from "./NumInput";
import UnitToggle from "./UnitToggle";
import {
  ExerciseEntry,
  Mode,
  SetEntry,
  Unit,
  convert,
  exerciseVolume,
  formatNumber,
  formatSeconds,
  formatSet,
  parseISODate,
} from "@/lib/workout";

interface Last {
  date: string;
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
}

export default function ExerciseCard({
  entry,
  last,
  displayUnit,
  allowMode,
  onChange,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  entry: ExerciseEntry;
  last: Last | null;
  displayUnit: Unit;
  allowMode?: boolean;
  onChange: (e: ExerciseEntry) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const setSet = (i: number, patch: Partial<SetEntry>) =>
    onChange({ ...entry, sets: entry.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const addSet = () => {
    const prev = entry.sets[entry.sets.length - 1];
    onChange({
      ...entry,
      sets: [...entry.sets, prev ? { ...prev } : { reps: null, weight: null, seconds: null }],
    });
  };

  const removeSet = (i: number) => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) });

  const changeUnit = (u: Unit) => {
    if (u === entry.unit) return;
    onChange({ ...entry, unit: u });
  };

  const isTime = entry.mode === "time";
  const vol = exerciseVolume(entry, displayUnit);
  const lastVol = last && last.mode === entry.mode ? exerciseVolume(last, displayUnit) : 0;
  const diff = vol - lastVol;

  const totalSecs = entry.sets.reduce((a, s) => a + (s.seconds ?? 0), 0);
  const lastSecs = last && last.mode === "time" ? last.sets.reduce((a, s) => a + (s.seconds ?? 0), 0) : 0;

  const prevFor = (i: number) => {
    if (!last || last.mode !== entry.mode) return null;
    const s = last.sets[i];
    if (!s) return null;
    if (isTime) return s.seconds ? formatSeconds(s.seconds) : null;
    if (!s.weight) return s.reps ? `${s.reps}` : null;
    const w = last.unit === entry.unit ? s.weight : Math.round(convert(s.weight, last.unit, entry.unit) * 10) / 10;
    return `${s.reps ?? "–"}×${w}`;
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold">{entry.name}</h3>
        <div className="flex shrink-0 items-center gap-0.5 text-zinc-400">
          <IconBtn label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>↑</IconBtn>
          <IconBtn label="Move down" disabled={isLast} onClick={() => onMove(1)}>↓</IconBtn>
          <IconBtn
            label="Remove exercise"
            onClick={() => {
              if (confirm(`Remove ${entry.name} from this day?`)) onRemove();
            }}
          >
            ✕
          </IconBtn>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        {allowMode && (
          <div className="flex rounded-md border border-zinc-300 bg-white text-xs">
            {(["reps", "time"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ ...entry, mode: m })}
                className={`px-1.5 py-0.5 first:rounded-l-md last:rounded-r-md ${entry.mode === m ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              >
                {m === "reps" ? "Reps" : "Time"}
              </button>
            ))}
          </div>
        )}
        {!isTime && <UnitToggle small unit={entry.unit} onChange={changeUnit} />}
      </div>

      {last ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <span className="font-semibold">
            Last ({parseISODate(last.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}):
          </span>{" "}
          {last.sets.map((s) => formatSet(s, last.mode, last.unit)).join(", ")}
          {last.mode === "reps" && lastVol > 0 && (
            <span className="text-amber-700">
              {" "}
              · vol {formatNumber(lastVol)} {displayUnit}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">First time logging this exercise.</p>
      )}

      {/* set table */}
      <div className="mt-3">
        <div
          className={`grid items-center gap-2 px-1 pb-1 text-[11px] font-medium uppercase text-zinc-500 ${
            isTime ? "grid-cols-[2rem_1fr_4.5rem_2rem]" : "grid-cols-[2rem_1fr_1fr_4.5rem_2rem]"
          }`}
        >
          <span>Set</span>
          {isTime ? (
            <span className="text-center">Seconds</span>
          ) : (
            <>
              <span className="text-center">Reps</span>
              <span className="text-center">Weight ({entry.unit})</span>
            </>
          )}
          <span className="text-center">Prev</span>
          <span />
        </div>
        <div className="space-y-1.5">
          {entry.sets.map((s, i) => (
            <div
              key={i}
              className={`grid items-center gap-2 px-1 ${isTime ? "grid-cols-[2rem_1fr_4.5rem_2rem]" : "grid-cols-[2rem_1fr_1fr_4.5rem_2rem]"}`}
            >
              <span className="text-center text-sm font-medium text-zinc-500">{i + 1}</span>
              {isTime ? (
                <NumInput ariaLabel={`Set ${i + 1} seconds`} value={s.seconds} onChange={(v) => setSet(i, { seconds: v })} placeholder="sec" />
              ) : (
                <>
                  <NumInput ariaLabel={`Set ${i + 1} reps`} value={s.reps} onChange={(v) => setSet(i, { reps: v })} placeholder="reps" />
                  <NumInput ariaLabel={`Set ${i + 1} weight`} decimal value={s.weight} onChange={(v) => setSet(i, { weight: v })} placeholder={entry.unit} />
                </>
              )}
              <span className="truncate text-center text-xs text-zinc-400">{prevFor(i) ?? "–"}</span>
              <button
                type="button"
                aria-label={`Remove set ${i + 1}`}
                onClick={() => removeSet(i)}
                className="rounded-md py-2 text-zinc-300 hover:bg-zinc-100 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={addSet} className="rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          + Add set
        </button>
        <span className="text-xs text-zinc-600">
          {isTime ? (
            <>
              Total {formatSeconds(totalSecs)}
              {lastSecs > 0 && <Delta value={totalSecs - lastSecs} suffix="s" />}
            </>
          ) : (
            <>
              Vol <span className="font-semibold">{formatNumber(vol)}</span> {displayUnit}
              {lastVol > 0 && vol > 0 && <Delta value={diff} suffix={` ${displayUnit}`} />}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function Delta({ value, suffix }: { value: number; suffix: string }) {
  const v = Math.round(value);
  if (v === 0) return <span className="ml-1 text-zinc-400">(= last)</span>;
  return (
    <span className={`ml-1 font-medium ${v > 0 ? "text-emerald-600" : "text-red-500"}`}>
      ({v > 0 ? "+" : ""}
      {v.toLocaleString()}
      {suffix})
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-2 py-1 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
