"use client";

import { useEffect, useId, useRef, useState } from "react";
import UnitToggle from "./UnitToggle";
import { Mode, Section, SetEntry, Unit, WorkoutType, formatSet, parseISODate } from "@/lib/workout";

export interface HistoryItem {
  name: string;
  types: Set<WorkoutType>;
  sections: Set<Section>;
  last: { date: string; unit: Unit; mode: Mode; sets: SetEntry[] } | null;
}

export default function ExercisePicker({
  title,
  candidates,
  allNames,
  defaultOpen,
  allowMode,
  onAdd,
  onAddNew,
}: {
  title: string;
  candidates: HistoryItem[];
  allNames: string[];
  defaultOpen: boolean;
  allowMode?: boolean;
  onAdd: (names: string[]) => void;
  onAddNew: (name: string, unit: Unit, mode: Mode) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<Unit>("kg");
  const [newMode, setNewMode] = useState<Mode>("reps");
  const listId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // new exercises appear above this panel; keep it on screen (iOS Safari does not do this on its own)
  const keepInView = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })));

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  // drop checks for exercises that are no longer candidates
  useEffect(() => {
    setChecked((prev) => {
      const next = new Set([...prev].filter((n) => candidates.some((c) => c.name === n)));
      return next.size === prev.size ? prev : next;
    });
  }, [candidates]);

  const toggle = (name: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const allChecked = candidates.length > 0 && checked.size === candidates.length;

  const addSelected = () => {
    // keep the order shown in the list
    onAdd(candidates.filter((c) => checked.has(c.name)).map((c) => c.name));
    setChecked(new Set());
    keepInView();
  };

  const addNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddNew(newName.trim(), newUnit, newMode);
    setNewName("");
    keepInView();
  };

  return (
    <div ref={panel} className="scroll-mb-4 rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium"
      >
        <span>
          + Add exercises
          <span className="ml-2 font-normal text-zinc-500">
            {candidates.length ? `${candidates.length} from history` : ""}
          </span>
        </span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-3 pb-3 pt-2">
          {candidates.length > 0 ? (
            <>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</span>
                <button
                  type="button"
                  className="text-xs text-zinc-600 underline"
                  onClick={() => setChecked(allChecked ? new Set() : new Set(candidates.map((c) => c.name)))}
                >
                  {allChecked ? "Clear" : "Select all"}
                </button>
              </div>
              <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
                {candidates.map((c) => (
                  <li key={c.name}>
                    <label className="flex cursor-pointer items-start gap-3 py-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0 accent-zinc-900"
                        checked={checked.has(c.name)}
                        onChange={() => toggle(c.name)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{c.name}</span>
                        {c.last ? (
                          <span className="block text-xs text-zinc-500">
                            {parseISODate(c.last.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {" · "}
                            {c.last.sets.map((s) => formatSet(s, c.last!.mode, c.last!.unit)).join(", ")}
                          </span>
                        ) : (
                          <span className="block text-xs text-zinc-400">No numbers logged yet</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={checked.size === 0}
                onClick={addSelected}
                className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-30"
              >
                Add selected ({checked.size})
              </button>
            </>
          ) : (
            <p className="py-1 text-sm text-zinc-500">Nothing else from history to add. Type a new exercise below (past exercises will autocomplete).</p>
          )}

          <form onSubmit={addNew} className="mt-3 border-t border-zinc-100 pt-3">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">New exercise</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                list={listId}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Incline Dumbbell Press"
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
              {(!allowMode || newMode === "reps") && <UnitToggle unit={newUnit} onChange={setNewUnit} />}
              <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-30" disabled={!newName.trim()}>
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
