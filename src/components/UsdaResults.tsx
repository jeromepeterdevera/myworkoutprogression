"use client";

import { fmt1 } from "@/lib/nutrition";
import { UsdaFood, useUsdaSearch } from "@/lib/usda";

/** USDA matches for `q`; tapping one hands it to `onPick`. */
export default function UsdaResults({
  q,
  onPick,
  busyId,
  hide,
  limit = 8,
}: {
  q: string;
  onPick: (f: UsdaFood) => void;
  /** fdcId being saved, to show progress */
  busyId?: number | null;
  /** names already shown elsewhere (lower case) */
  hide?: Set<string>;
  limit?: number;
}) {
  const { foods, error, loading, term } = useUsdaSearch(q);
  if (term.length < 2) return null;
  const list = (hide ? foods.filter((f) => !hide.has(f.name.toLowerCase())) : foods).slice(0, limit);

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        <span>USDA food database</span>
        <span className="normal-case tracking-normal text-zinc-400">per 100 g</span>
      </div>
      {loading && <p className="px-1 py-2 text-sm text-zinc-400">Searching…</p>}
      {!loading && error && <p className="px-1 py-2 text-sm text-red-600">{error}</p>}
      {!loading && !error && list.length === 0 && <p className="px-1 py-2 text-sm text-zinc-400">No matches. Try fewer or different words.</p>}
      {!loading && list.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {list.map((f) => (
            <li key={f.fdcId}>
              <button
                type="button"
                disabled={busyId != null}
                onClick={() => onPick(f)}
                className="block w-full px-1 py-2 text-left hover:bg-white disabled:opacity-50"
              >
                <span className="block text-sm">{busyId === f.fdcId ? "Adding…" : f.name}</span>
                <span className="block text-xs text-zinc-500">
                  {Math.round(f.calories ?? f.protein * 4 + f.carbs * 4 + f.fat * 9)} kcal · P {fmt1(f.protein)} · C {fmt1(f.carbs)} · F {fmt1(f.fat)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
