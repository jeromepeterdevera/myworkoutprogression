"use client";

import type { Unit } from "@/lib/workout";

export default function UnitToggle({ unit, onChange, small }: { unit: Unit; onChange: (u: Unit) => void; small?: boolean }) {
  return (
    <div className="flex shrink-0 rounded-md border border-zinc-300 bg-white text-xs">
      {(["kg", "lb"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`${small ? "px-1.5 py-0.5" : "px-2 py-1"} ${unit === u ? "bg-zinc-900 text-white" : "text-zinc-600"} first:rounded-l-md last:rounded-r-md`}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
