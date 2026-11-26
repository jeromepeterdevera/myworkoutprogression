"use client";

import { useState } from "react";
import { GROUPS, Group, Muscle, groupLabel, sortMuscles } from "@/lib/muscles";

/** Muscle picker: one row per group (Chest, Shoulders, …), tap any number of parts. */
export default function MuscleChips({
  value,
  onChange,
  highlight = [],
}: {
  value: Muscle[];
  onChange: (m: Muscle[]) => void;
  /** groups to point out, e.g. an old broad tag that needs a part */
  highlight?: Group[];
}) {
  const toggle = (m: Muscle) => onChange(value.includes(m) ? value.filter((x) => x !== m) : sortMuscles([...value, m]));
  return (
    <div className="space-y-1.5" role="group" aria-label="Muscles worked">
      {GROUPS.map((g) => {
        const flag = highlight.includes(g.value) && !g.parts.some((p) => value.includes(p.value));
        return (
          <div key={g.value} className={`flex items-start gap-2 rounded-md ${flag ? "bg-amber-100 p-1" : ""}`}>
            <span className="w-[4.5rem] shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{g.label}</span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {g.parts.map((p) => {
                const on = value.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={on}
                    aria-label={p.label}
                    onClick={() => toggle(p.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {p.short}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Inline editor: chips plus Save / Cancel. */
export function MuscleEditor({
  initial,
  legacy = [],
  onSave,
  onCancel,
}: {
  initial: Muscle[];
  /** old broad tags to replace with specific parts */
  legacy?: Group[];
  onSave: (m: Muscle[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Muscle[]>(initial);
  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2">
      <p className="mb-1.5 text-xs text-zinc-600">
        Which muscles does it work? Pick all that apply.
        {legacy.length > 0 && (
          <span className="block text-amber-800">
            It was tagged {legacy.map(groupLabel).join(", ")}; pick the part{legacy.length > 1 ? "s" : ""} it works.
          </span>
        )}
      </p>
      <MuscleChips value={draft} onChange={setDraft} highlight={legacy} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200">
          Cancel
        </button>
        <button
          type="button"
          disabled={!draft.length}
          onClick={() => onSave(draft)}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  );
}
