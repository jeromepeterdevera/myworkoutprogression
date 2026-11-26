"use client";

import { useId, useState } from "react";
import NumInput from "./NumInput";
import { MuscleEditor } from "./MuscleChips";
import { IconBtn, VerdictChip } from "./ExerciseCard";
import { verdict } from "@/lib/effort";
import { Muscle, Tag, isTagged, tagText } from "@/lib/muscles";
import {
  ExerciseEntry,
  LastSession,
  Mode,
  SetEntry,
  Unit,
  fillSet,
  formatSet,
  isSetDone,
  parseISODate,
  suggestedSet,
} from "@/lib/workout";

const EMPTY: SetEntry = { reps: null, weight: null, seconds: null };
const setAt = (e: ExerciseEntry, r: number) => e.sets[r] ?? EMPTY;
/** pads the sets to `rounds` so every exercise has a set per round */
const padded = (e: ExerciseEntry, rounds: number) =>
  e.sets.length >= rounds ? e.sets : [...e.sets, ...Array.from({ length: rounds - e.sets.length }, () => ({ ...EMPTY }))];

/** Exercises done back to back, logged round by round. Set i of each exercise is round i+1. */
export default function CircuitCard({
  items,
  lastOf,
  bestOf,
  tagOf,
  displayUnit,
  allowMode,
  allNames,
  onItems,
  onAddExercise,
  onRemoveExercise,
  onSplit,
  onRemove,
  onMove,
  onSetDone,
  onTag,
  isFirst,
  isLast,
}: {
  items: ExerciseEntry[];
  lastOf: (name: string) => LastSession | null;
  bestOf: (name: string) => number;
  tagOf: (name: string) => Tag;
  displayUnit: Unit;
  allowMode?: boolean;
  allNames: string[];
  /** replaces the circuit's exercises (same keys) */
  onItems: (next: ExerciseEntry[]) => void;
  onAddExercise: (name: string, mode: Mode) => void;
  onRemoveExercise: (key: string) => void;
  /** turn the circuit back into separate exercises */
  onSplit: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onSetDone?: () => void;
  onTag: (name: string, muscles: Muscle[]) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const rounds = Math.max(1, ...items.map((e) => e.sets.length));
  const roundDone = (r: number) => items.every((e) => isSetDone(setAt(e, r), e.mode));
  const [openDone, setOpenDone] = useState<Set<number>>(new Set());
  const [tagging, setTagging] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<Mode>("reps");
  const listId = useId();

  const setCell = (key: string, r: number, patch: Partial<SetEntry>) =>
    onItems(
      items.map((e) => {
        if (e.key !== key) return e;
        const sets = padded(e, rounds).map((s, j) => (j === r ? { ...s, ...patch } : s));
        return { ...e, sets };
      })
    );

  const tickRound = (r: number) => {
    const next = items.map((e) => {
      const sets = padded(e, rounds);
      return { ...e, sets: sets.map((s, j) => (j === r ? fillSet(s, suggestedSet({ ...e, sets }, lastOf(e.name), r), e.mode) : s)) };
    });
    onItems(next);
    onSetDone?.();
    setOpenDone((prev) => {
      const n = new Set(prev);
      n.delete(r);
      return n;
    });
  };

  const addRound = () => onItems(items.map((e) => ({ ...e, sets: [...padded(e, rounds), { ...EMPTY }] })));
  const removeRound = (r: number) => onItems(items.map((e) => ({ ...e, sets: padded(e, rounds).filter((_, j) => j !== r) })));

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddExercise(newName.trim(), newMode);
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">
          <span className="mr-1 text-indigo-600">↻</span>
          {items.length > 1 ? "Circuit" : "Circuit (add exercises)"}
          <span className="ml-1.5 text-sm font-normal text-zinc-500">
            {items.length} exercise{items.length === 1 ? "" : "s"} · {rounds} round{rounds === 1 ? "" : "s"}
          </span>
        </h3>
        <div className="flex shrink-0 items-center gap-0.5 text-zinc-400">
          <IconBtn label="Split into separate exercises" onClick={onSplit}>
            ⇵
          </IconBtn>
          <IconBtn label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>
            ↑
          </IconBtn>
          <IconBtn label="Move down" disabled={isLast} onClick={() => onMove(1)}>
            ↓
          </IconBtn>
          <IconBtn
            label="Remove circuit"
            onClick={() => {
              if (confirm("Remove this circuit and its exercises from this day?")) onRemove();
            }}
          >
            ✕
          </IconBtn>
        </div>
      </div>

      {/* the exercises */}
      <ol className="mt-2 space-y-2">
        {items.map((e, i) => {
          const last = lastOf(e.name);
          const tag = tagOf(e.name);
          const v = verdict(e, last, bestOf(e.name), displayUnit);
          return (
            <li key={e.key} className="rounded-lg bg-zinc-50 px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-sm font-medium">
                    <span className="mr-1 text-xs text-zinc-400">{String.fromCharCode(65 + i)}</span>
                    {e.name}
                  </span>
                  {tagging !== e.name && (
                    <button
                      type="button"
                      onClick={() => setTagging(e.name)}
                      className={`ml-1.5 rounded-full px-1.5 text-[11px] ${
                        isTagged(tag) && !tag.legacy.length ? "bg-zinc-200 text-zinc-700" : "bg-amber-100 font-medium text-amber-900"
                      }`}
                    >
                      {isTagged(tag) ? `${tagText(tag)} ✎` : "Tag muscles"}
                    </button>
                  )}
                  <span className="block text-[11px] text-amber-900">
                    {last
                      ? `Last (${parseISODate(last.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}): ${last.sets
                          .map((s) => formatSet(s, last.mode, last.unit))
                          .join(", ")}`
                      : "First time logging this exercise."}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {v && <VerdictChip v={v} />}
                  <button
                    type="button"
                    aria-label={`Remove ${e.name}`}
                    onClick={() => {
                      if (confirm(`Remove ${e.name} from this day?`)) onRemoveExercise(e.key);
                    }}
                    className="rounded px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-200 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              </div>
              {tagging === e.name && (
                <MuscleEditor
                  initial={tag.muscles}
                  legacy={tag.legacy}
                  onCancel={() => setTagging(null)}
                  onSave={(m) => {
                    onTag(e.name, m);
                    setTagging(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* rounds */}
      <div className="mt-3 space-y-2">
        {Array.from({ length: rounds }, (_, r) => {
          const done = roundDone(r);
          if (done && !openDone.has(r)) {
            return (
              <button
                key={r}
                type="button"
                onClick={() => setOpenDone((prev) => new Set(prev).add(r))}
                className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-left text-xs hover:bg-zinc-50"
                aria-label={`Round ${r + 1}, done. Tap to edit`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">✓</span>
                <b className="shrink-0">Round {r + 1}</b>
                <span className="min-w-0 truncate text-zinc-600">
                  {items.map((e) => `${e.name} ${formatSet(setAt(e, r), e.mode, e.unit)}`).join(" · ")}
                </span>
              </button>
            );
          }
          const ghosts = items.map((e) => suggestedSet({ ...e, sets: padded(e, rounds) }, lastOf(e.name), r));
          const canTick = items.every((e, i) => isSetDone(fillSet(setAt(e, r), ghosts[i], e.mode), e.mode));
          return (
            <div key={r} className="rounded-lg border border-zinc-200 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <b className="text-sm">Round {r + 1}</b>
                <span className="flex items-center gap-1">
                  {rounds > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove round ${r + 1}`}
                      onClick={() => removeRound(r)}
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={done ? `Round ${r + 1} done` : `Mark round ${r + 1} done`}
                    aria-pressed={done}
                    disabled={!done && !canTick}
                    onClick={() =>
                      done
                        ? setOpenDone((prev) => {
                            const n = new Set(prev);
                            n.delete(r);
                            return n;
                          })
                        : tickRound(r)
                    }
                    className={`flex h-9 w-12 items-center justify-center rounded-md border text-base font-bold ${
                      done
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-400 hover:border-emerald-600 hover:text-emerald-600 disabled:opacity-40"
                    }`}
                  >
                    ✓
                  </button>
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((e, i) => {
                  const s = setAt(e, r);
                  const g = ghosts[i];
                  return (
                    <div key={e.key} className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-center gap-1.5">
                      <span className="truncate text-sm">
                        <span className="mr-1 text-xs text-zinc-400">{String.fromCharCode(65 + i)}</span>
                        {e.name}
                      </span>
                      {e.mode === "time" ? (
                        <div className="col-span-2">
                          <NumInput
                            compact
                            ghost={g?.seconds != null}
                            ariaLabel={`${e.name}, round ${r + 1}, seconds`}
                            value={s.seconds}
                            onChange={(x) => setCell(e.key, r, { seconds: x })}
                            placeholder={g?.seconds != null ? `${g.seconds}s` : "sec"}
                          />
                        </div>
                      ) : (
                        <>
                          <NumInput
                            compact
                            ghost={g?.reps != null}
                            ariaLabel={`${e.name}, round ${r + 1}, reps`}
                            value={s.reps}
                            onChange={(x) => setCell(e.key, r, { reps: x })}
                            placeholder={g?.reps != null ? String(g.reps) : "reps"}
                          />
                          <NumInput
                            compact
                            decimal
                            ghost={g?.weight != null}
                            ariaLabel={`${e.name}, round ${r + 1}, weight in ${e.unit}`}
                            value={s.weight}
                            onChange={(x) => setCell(e.key, r, { weight: x })}
                            placeholder={g?.weight != null ? String(g.weight) : e.unit}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={addRound} className="rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          + Round
        </button>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
            + Exercise
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={submitNew} className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2">
          <input
            autoFocus
            list={listId}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Exercise name"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-2 text-base outline-none focus:border-zinc-900"
          />
          <datalist id={listId}>
            {allNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {allowMode && (
            <div className="flex shrink-0 rounded-md border border-zinc-300 bg-white text-xs">
              {(["reps", "time"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewMode(m)}
                  className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${newMode === m ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
                >
                  {m === "reps" ? "Reps" : "Time"}
                </button>
              ))}
            </div>
          )}
          <button type="submit" disabled={!newName.trim()} className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-30">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2 py-2 text-sm text-zinc-600">
            Cancel
          </button>
          <p className="w-full text-[11px] text-zinc-500">
            An exercise already on this day moves into the circuit. A new one can be tagged with muscles once added.
          </p>
        </form>
      )}
    </div>
  );
}
