"use client";

import { useState } from "react";
import NumInput from "./NumInput";
import UnitToggle from "./UnitToggle";
import { Verdict, verdict } from "@/lib/effort";
import { ExerciseEntry, Mode, SetEntry, Unit, convert, formatSet, parseISODate } from "@/lib/workout";

interface Last {
  date: string;
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
}

const EMPTY: SetEntry = { reps: null, weight: null, seconds: null };
const isDone = (s: SetEntry, mode: Mode) => (mode === "time" ? !!s.seconds : !!s.reps);

export default function ExerciseCard({
  entry,
  last,
  bestKg,
  displayUnit,
  allowMode,
  onChange,
  onRemove,
  onMove,
  onSetDone,
  isFirst,
  isLast,
}: {
  entry: ExerciseEntry;
  last: Last | null;
  /** best estimated one-rep max before this day, kg (0 if none) */
  bestKg: number;
  displayUnit: Unit;
  allowMode?: boolean;
  onChange: (e: ExerciseEntry) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** a set was ticked off (starts the rest timer) */
  onSetDone?: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isTime = entry.mode === "time";
  const complete = entry.sets.length > 0 && entry.sets.every((s) => isDone(s, entry.mode));
  const [open, setOpen] = useState(!complete);

  const lastSets = last && last.mode === entry.mode ? last.sets : [];
  const fromLast = (s: SetEntry): SetEntry => ({
    ...s,
    weight: s.weight && last!.unit !== entry.unit ? Math.round(convert(s.weight, last!.unit, entry.unit) * 10) / 10 : s.weight,
  });
  /** Suggested values for set i: the same set last time, else the set above, else last time's final set. */
  const ghostFor = (i: number): SetEntry | null => {
    if (lastSets[i]) return fromLast(lastSets[i]);
    for (let j = i - 1; j >= 0; j--) if (isDone(entry.sets[j], entry.mode)) return entry.sets[j];
    return lastSets.length ? fromLast(lastSets[lastSets.length - 1]) : null;
  };

  const setSet = (i: number, patch: Partial<SetEntry>) =>
    onChange({ ...entry, sets: entry.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  /** ✓: fill whatever is empty from the suggestion. */
  const tick = (i: number) => {
    const s = entry.sets[i];
    const g = ghostFor(i);
    const filled: SetEntry = isTime
      ? { ...s, seconds: s.seconds ?? g?.seconds ?? null }
      : { ...s, reps: s.reps ?? g?.reps ?? null, weight: s.weight ?? g?.weight ?? null };
    if (!isDone(filled, entry.mode)) return;
    const sets = entry.sets.map((x, j) => (j === i ? filled : x));
    onChange({ ...entry, sets });
    onSetDone?.();
    if (sets.every((x) => isDone(x, entry.mode))) setOpen(false);
  };

  const addSet = () => {
    onChange({ ...entry, sets: [...entry.sets, { ...EMPTY }] });
    setOpen(true);
  };
  const removeSet = (i: number) => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) });

  const changeUnit = (u: Unit) => {
    if (u === entry.unit) return;
    onChange({ ...entry, unit: u });
  };

  const v = verdict(entry, last, bestKg, displayUnit);
  const done = entry.sets.filter((s) => isDone(s, entry.mode));
  const cols = isTime ? "grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_1.75rem]" : "grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.25fr)_2.5rem_1.75rem]";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
        aria-label={`${entry.name}, done. Tap to edit`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-semibold">{entry.name}</span>
          <span className="block truncate text-xs text-zinc-600">
            {done.map((s) => formatSet(s, entry.mode, entry.unit)).join(", ")}
          </span>
        </span>
        {v && <VerdictChip v={v} />}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold">{entry.name}</h3>
        <div className="flex shrink-0 items-center gap-0.5 text-zinc-400">
          {complete && (
            <IconBtn label="Collapse" onClick={() => setOpen(false)}>
              ⌃
            </IconBtn>
          )}
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
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">First time logging this exercise.</p>
      )}

      {/* set table */}
      <div className="mt-3">
        <div className={`grid items-center gap-1.5 pb-1 text-[11px] font-medium uppercase text-zinc-500 ${cols}`}>
          <span className="text-center">Set</span>
          {isTime ? (
            <span className="text-center">Seconds</span>
          ) : (
            <>
              <span className="text-center">Reps</span>
              <span className="text-center">{entry.unit}</span>
            </>
          )}
          <span className="text-center">Done</span>
          <span />
        </div>
        <div className="space-y-1.5">
          {entry.sets.map((s, i) => {
            const g = ghostFor(i);
            const ok = isDone(s, entry.mode);
            const canTick = !ok && isDone({ ...s, reps: s.reps ?? g?.reps ?? null, seconds: s.seconds ?? g?.seconds ?? null }, entry.mode);
            return (
              <div key={i} className={`grid items-center gap-1.5 ${cols}`}>
                <span className="text-center text-sm font-medium text-zinc-500">{i + 1}</span>
                {isTime ? (
                  <Stepper
                    label={`set ${i + 1} seconds`}
                    value={s.seconds}
                    ghost={g?.seconds ?? null}
                    step={5}
                    placeholder="sec"
                    onChange={(x) => setSet(i, { seconds: x })}
                  />
                ) : (
                  <>
                    <Stepper
                      label={`set ${i + 1} reps`}
                      value={s.reps}
                      ghost={g?.reps ?? null}
                      step={1}
                      placeholder="reps"
                      onChange={(x) => setSet(i, { reps: x })}
                    />
                    <Stepper
                      label={`set ${i + 1} weight`}
                      decimal
                      value={s.weight}
                      ghost={g?.weight ?? null}
                      step={entry.unit === "kg" ? 2.5 : 5}
                      placeholder={entry.unit}
                      onChange={(x) => setSet(i, { weight: x })}
                    />
                  </>
                )}
                <button
                  type="button"
                  aria-label={ok ? `Set ${i + 1} done` : `Mark set ${i + 1} done`}
                  aria-pressed={ok}
                  disabled={!ok && !canTick}
                  onClick={() => tick(i)}
                  className={`flex h-10 items-center justify-center rounded-md border text-base font-bold ${
                    ok
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-400 hover:border-emerald-600 hover:text-emerald-600 disabled:opacity-40"
                  }`}
                >
                  ✓
                </button>
                <button
                  type="button"
                  aria-label={`Remove set ${i + 1}`}
                  onClick={() => removeSet(i)}
                  className="rounded-md py-2 text-zinc-300 hover:bg-zinc-100 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={addSet} className="rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          + Add set
        </button>
        {v && <VerdictChip v={v} />}
      </div>
    </div>
  );
}

function VerdictChip({ v }: { v: Verdict }) {
  const style =
    v.tone === "best"
      ? "bg-amber-100 text-amber-900"
      : v.tone === "up"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-zinc-100 text-zinc-700";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {v.tone === "best" && <span className="text-amber-600">★ </span>}
      {v.tone === "up" && "↑ "}
      {v.tone === "down" && "↓ "}
      {v.text}
    </span>
  );
}

/** Number box with − / + buttons. Starts from the suggested value when empty. */
function Stepper({
  value,
  ghost,
  step,
  decimal,
  placeholder,
  label,
  onChange,
}: {
  value: number | null;
  ghost: number | null;
  step: number;
  decimal?: boolean;
  placeholder: string;
  label: string;
  onChange: (v: number | null) => void;
}) {
  const bump = (d: number) => {
    const n = Math.round(((value ?? ghost ?? 0) + d) * 100) / 100;
    onChange(n > 0 ? n : null);
  };
  const btn = "w-6 shrink-0 border-zinc-300 bg-zinc-50 text-zinc-600 active:bg-zinc-200";
  return (
    <div className="flex min-w-0">
      <button type="button" aria-label={`Less, ${label}`} onClick={() => bump(-step)} className={`${btn} rounded-l-md border border-r-0`}>
        −
      </button>
      <div className="min-w-0 flex-1 [&>input]:rounded-none">
        <NumInput
          compact
          ghost={ghost != null}
          ariaLabel={label}
          decimal={decimal}
          value={value}
          onChange={onChange}
          placeholder={ghost != null ? String(ghost) : placeholder}
        />
      </div>
      <button type="button" aria-label={`More, ${label}`} onClick={() => bump(step)} className={`${btn} rounded-r-md border border-l-0`}>
        +
      </button>
    </div>
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
      className="rounded-md px-2 py-1 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
