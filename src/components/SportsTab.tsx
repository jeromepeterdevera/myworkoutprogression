"use client";

import { useId, useMemo } from "react";
import NumInput from "./NumInput";
import { newKey } from "@/lib/workout";
import { DEFAULT_SPORT_MET, INTENSITIES, SPORTS, SportEntry, sportKcal, sportMet } from "@/lib/activity";

export default function SportsTab({
  items,
  kg,
  pastSports,
  onChange,
}: {
  items: SportEntry[];
  kg: number;
  /** sports you've logged before, most recent first */
  pastSports: string[];
  onChange: (items: SportEntry[]) => void;
}) {
  const listId = useId();
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...pastSports, ...SPORTS.map((s) => s.name)]) {
      const k = n.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
    return out;
  }, [pastSports]);

  const update = (key: string, patch: Partial<SportEntry>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = (sport = "") => onChange([...items, { key: newKey(), sport, minutes: null, intensity: "moderate", sets: [] }]);
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));

  const quick = pastSports.filter((p) => !items.some((i) => i.sport.toLowerCase() === p.toLowerCase())).slice(0, 6);

  return (
    <div className="space-y-3">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {items.map((it) => {
        const kcal = sportKcal(it, kg);
        const known = sportMet(it.sport) != null;
        return (
          <div key={it.key} className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <input
                list={listId}
                value={it.sport}
                onChange={(e) => update(it.key, { sport: e.target.value })}
                placeholder="Sport, e.g. Basketball"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-2 text-base font-medium outline-none focus:border-zinc-900"
              />
              <button
                type="button"
                onClick={() => remove(it.key)}
                className="shrink-0 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                aria-label="Remove sport"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block w-24">
                <span className="mb-1 block text-xs text-zinc-500">Minutes played</span>
                <NumInput value={it.minutes} onChange={(v) => update(it.key, { minutes: v })} decimal ariaLabel="Minutes played" />
              </label>
              <div>
                <span className="mb-1 block text-xs text-zinc-500">Intensity</span>
                <div className="flex rounded-md border border-zinc-300 bg-white text-sm">
                  {INTENSITIES.map((x) => (
                    <button
                      key={x.value}
                      type="button"
                      onClick={() => update(it.key, { intensity: x.value })}
                      className={`px-2.5 py-2 first:rounded-l-md last:rounded-r-md ${it.intensity === x.value ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-lg font-semibold">{kcal ? `≈ ${Math.round(kcal)}` : "–"}</div>
                <div className="text-[11px] text-zinc-500">kcal burned</div>
              </div>
            </div>
            {it.sport.trim() && !known && (
              <p className="mt-2 text-[11px] text-zinc-500">
                Not in the sports list, so the estimate uses an average effort ({DEFAULT_SPORT_MET} MET).
              </p>
            )}

            {/* sets */}
            <div className="mt-3 border-t border-zinc-100 pt-2">
              {it.sets.length > 0 && (
                <div className="mb-2 grid grid-cols-[3rem_1fr_1fr_2rem] items-center gap-2 text-center text-xs text-zinc-500">
                  <span />
                  <span>You</span>
                  <span>Opponent</span>
                  <span />
                  {it.sets.map((s, i) => {
                    const won = s.us != null && s.them != null ? (s.us > s.them ? "W" : s.us < s.them ? "L" : "") : "";
                    return (
                      <div key={i} className="contents">
                        <span className="text-left text-sm text-zinc-700">
                          Set {i + 1}
                          {won && <span className={`ml-1 text-[10px] font-bold ${won === "W" ? "text-emerald-600" : "text-rose-600"}`}>{won}</span>}
                        </span>
                        <NumInput
                          value={s.us}
                          onChange={(v) => update(it.key, { sets: it.sets.map((x, j) => (j === i ? { ...x, us: v } : x)) })}
                          ariaLabel={`Set ${i + 1} your score`}
                        />
                        <NumInput
                          value={s.them}
                          onChange={(v) => update(it.key, { sets: it.sets.map((x, j) => (j === i ? { ...x, them: v } : x)) })}
                          ariaLabel={`Set ${i + 1} opponent score`}
                        />
                        <button
                          type="button"
                          onClick={() => update(it.key, { sets: it.sets.filter((_, j) => j !== i) })}
                          className="rounded py-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                          aria-label={`Remove set ${i + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => update(it.key, { sets: [...it.sets, { us: null, them: null }] })}
                className="text-sm text-zinc-600 hover:underline"
              >
                + Add set {it.sets.length === 0 && <span className="text-zinc-400">(optional, for sports scored in sets)</span>}
              </button>
            </div>
          </div>
        );
      })}

      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => add(q)}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              + {q}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => add()}
        className="w-full rounded-lg border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        + Add sport
      </button>
    </div>
  );
}
