"use client";

import { useState } from "react";
import { MUSCLES, Muscle, sortMuscles } from "@/lib/muscles";

/** Multi-select muscle chips. */
export default function MuscleChips({ value, onChange }: { value: Muscle[]; onChange: (m: Muscle[]) => void }) {
  const toggle = (m: Muscle) => onChange(value.includes(m) ? value.filter((x) => x !== m) : sortMuscles([...value, m]));
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Muscles worked">
      {MUSCLES.map((m) => {
        const on = value.includes(m.value);
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(m.value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** Inline editor: chips plus Save / Cancel. */
export function MuscleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Muscle[];
  onSave: (m: Muscle[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Muscle[]>(initial);
  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2">
      <p className="mb-1.5 text-xs text-zinc-600">Which muscles does it work? Pick all that apply.</p>
      <MuscleChips value={draft} onChange={setDraft} />
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
