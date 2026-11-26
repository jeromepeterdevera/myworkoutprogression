"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import UnitToggle from "./UnitToggle";
import MuscleChips, { MuscleEditor } from "./MuscleChips";
import { HistoryItem } from "./ExercisePicker";
import { workOf } from "@/lib/effort";
import { Muscle, muscleLabel } from "@/lib/muscles";
import { Unit, WorkoutType, convert, exerciseVolume, formatNumber, formatSet, parseISODate, typeInfo } from "@/lib/workout";

export interface RecentSession {
  date: string;
  type: WorkoutType | null;
  effort: number | null;
  /** main exercises, in the order done */
  names: string[];
}

const shortDate = (iso: string) => parseISODate(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function daysAgo(iso: string, today: string) {
  const d = Math.round((parseISODate(today).getTime() - parseISODate(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d}d ago` : `${Math.round(d / 7)}w ago`;
}

/**
 * Add exercises for a workout type, by the muscles it trains: recent sessions that hit those muscles
 * (whatever type the day was), then every matching exercise grouped by muscle with your last numbers.
 */
export default function MusclePicker({
  type,
  date,
  dayMuscles,
  candidates,
  tags,
  sessions,
  taken,
  displayUnit,
  allNames,
  defaultOpen,
  onAdd,
  onAddNew,
  onTag,
}: {
  type: WorkoutType;
  date: string;
  dayMuscles: Muscle[];
  /** exercises you've logged in the main section before, newest first */
  candidates: HistoryItem[];
  /** muscles per exercise, by lower-case name */
  tags: Map<string, Muscle[]>;
  /** earlier days, newest first */
  sessions: RecentSession[];
  /** lower-case names already on this day */
  taken: Set<string>;
  displayUnit: Unit;
  allNames: string[];
  defaultOpen: boolean;
  onAdd: (names: string[]) => void;
  onAddNew: (name: string, unit: Unit, muscles: Muscle[]) => void;
  onTag: (name: string, muscles: Muscle[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Muscle | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [showUntagged, setShowUntagged] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<Unit>("kg");
  const [newMuscles, setNewMuscles] = useState<Muscle[]>([]);
  const listId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const keepInView = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })));

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  useEffect(() => setFilter(null), [type]);

  const musclesOf = (name: string) => tags.get(name.toLowerCase()) ?? [];
  const hits = (name: string) => musclesOf(name).some((m) => dayMuscles.includes(m));

  const available = useMemo(() => candidates.filter((c) => !taken.has(c.name.toLowerCase())), [candidates, taken]);
  const byName = useMemo(() => new Map(available.map((c) => [c.name.toLowerCase(), c])), [available]);

  // drop checks for exercises that are no longer offered
  useEffect(() => {
    setChecked((prev) => {
      const next = new Set([...prev].filter((n) => byName.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [byName]);

  const matching = available.filter((c) => hits(c.name));
  const untagged = available
    .filter((c) => !musclesOf(c.name).length)
    // ones done on this type of day first
    .sort((a, b) => Number(b.types.has(type)) - Number(a.types.has(type)));
  const shownMuscles = filter ? [filter] : dayMuscles;
  const groups = shownMuscles
    .map((m) => ({ muscle: m, items: matching.filter((c) => musclesOf(c.name).includes(m)) }))
    .filter((g) => g.items.length);

  const recent = sessions
    .map((s) => ({ ...s, match: s.names.filter(hits) }))
    .filter((s) => s.match.length)
    .slice(0, 3);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectSession = (names: string[]) => {
    const keys = names.map((n) => n.toLowerCase()).filter((k) => byName.has(k));
    setChecked((prev) => {
      const allIn = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      for (const k of keys) {
        if (allIn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const addSelected = () => {
    // in the order they were last done, newest first, as listed
    onAdd(available.filter((c) => checked.has(c.name.toLowerCase())).map((c) => c.name));
    setChecked(new Set());
    keepInView();
  };

  const addNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newMuscles.length) return;
    onAddNew(newName.trim(), newUnit, newMuscles);
    setNewName("");
    setNewMuscles([]);
    keepInView();
  };

  // an existing exercise typed in the new-exercise box keeps its tags
  const typedKnown = tags.get(newName.trim().toLowerCase());

  return (
    <div ref={panel} className="scroll-mb-24 rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium"
      >
        <span>
          + Add exercises
          <span className="ml-2 font-normal text-zinc-500">{matching.length ? `${matching.length} for ${dayMuscles.map(muscleLabel).join(", ").toLowerCase()}` : ""}</span>
        </span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-3 pb-3 pt-2">
          {/* recent sessions */}
          {recent.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Repeat a recent session</h3>
              <ul className="space-y-2">
                {recent.map((s) => {
                  const info = typeInfo(s.type);
                  const keys = s.match.map((n) => n.toLowerCase()).filter((k) => byName.has(k));
                  const selected = keys.length > 0 && keys.every((k) => checked.has(k));
                  const extra = s.names.length - s.match.length;
                  return (
                    <li key={s.date} className={`rounded-lg border p-2.5 ${selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"}`}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {info && <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${info.color}`} />}
                          <b>{info?.label ?? "Workout"}</b>
                          <span className="truncate text-zinc-500">
                            · {shortDate(s.date)}
                            {s.effort ? ` · effort ${s.effort}/10` : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={!keys.length}
                          onClick={() => selectSession(s.match)}
                          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-30 ${
                            selected ? "bg-zinc-200 text-zinc-800" : "bg-zinc-900 text-white"
                          }`}
                        >
                          {selected ? "Unselect" : "Select these"}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600">
                        {s.match.map((n, i) => (
                          <span key={n} className={byName.has(n.toLowerCase()) ? "" : "text-zinc-400 line-through"}>
                            {i > 0 && ", "}
                            {n}
                          </span>
                        ))}
                        {extra > 0 && <span className="text-zinc-400"> (+{extra} for other muscles)</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* by muscle */}
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">By muscle</h3>
            </div>
            {dayMuscles.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[null, ...dayMuscles].map((m) => (
                  <button
                    key={m ?? "all"}
                    type="button"
                    onClick={() => setFilter(m)}
                    aria-pressed={filter === m}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      filter === m ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {m ? muscleLabel(m) : "All"}
                  </button>
                ))}
              </div>
            )}

            {groups.length ? (
              <div className="max-h-[28rem] overflow-y-auto">
                {groups.map((g) => (
                  <div key={g.muscle} className="mb-2">
                    <div className="sticky top-0 bg-white py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700">
                      {muscleLabel(g.muscle)}
                    </div>
                    <ul className="divide-y divide-zinc-100">
                      {g.items.map((c) => (
                        <CandidateRow
                          key={c.name}
                          item={c}
                          today={date}
                          unit={displayUnit}
                          checked={checked.has(c.name.toLowerCase())}
                          onToggle={() => toggle(c.name.toLowerCase())}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-1 text-sm text-zinc-500">
                {available.length
                  ? `No tagged exercises for ${shownMuscles.map(muscleLabel).join(", ").toLowerCase()} yet. Tag your exercises below, or add a new one.`
                  : "Nothing else from history to add. Add a new exercise below."}
              </p>
            )}
          </section>

          <button
            type="button"
            disabled={checked.size === 0}
            onClick={addSelected}
            className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-30"
          >
            Add selected ({checked.size})
          </button>

          {/* exercises without muscles yet */}
          {untagged.length > 0 && (
            <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
              <button
                type="button"
                onClick={() => setShowUntagged((v) => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-amber-900"
              >
                <span>
                  {untagged.length} exercise{untagged.length === 1 ? "" : "s"} without muscles
                  <span className="block text-xs font-normal text-amber-800">Tag them once and they&apos;ll show up on the right days.</span>
                </span>
                <span className="text-amber-700">{showUntagged || !matching.length ? "▲" : "▼"}</span>
              </button>
              {(showUntagged || !matching.length) && (
                <ul className="mt-2 divide-y divide-amber-100">
                  {untagged.map((c) => (
                    <li key={c.name} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{c.name}</span>
                          <span className="block text-xs text-zinc-500">
                            {[...c.types].map((t) => typeInfo(t)?.label).filter(Boolean).join(", ") || "No type"}
                            {c.last ? ` · last ${shortDate(c.last.date)}` : ""}
                          </span>
                        </span>
                        {tagging !== c.name && (
                          <button
                            type="button"
                            onClick={() => setTagging(c.name)}
                            className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium"
                          >
                            Tag
                          </button>
                        )}
                      </div>
                      {tagging === c.name && (
                        <MuscleEditor
                          initial={[]}
                          onCancel={() => setTagging(null)}
                          onSave={(m) => {
                            onTag(c.name, m);
                            setTagging(null);
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* new exercise */}
          <form onSubmit={addNew} className="mt-3 border-t border-zinc-100 pt-3">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">New exercise</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                list={listId}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  const known = tags.get(e.target.value.trim().toLowerCase());
                  if (known?.length) setNewMuscles(known);
                }}
                placeholder="e.g. Incline Dumbbell Press"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-2 text-base outline-none focus:border-zinc-900"
              />
              <datalist id={listId}>
                {allNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <UnitToggle unit={newUnit} onChange={setNewUnit} />
            </div>
            <p className="mb-1.5 mt-2 text-xs text-zinc-600">
              Muscles it works{typedKnown?.length ? " (saved before, change if needed)" : ""}:
            </p>
            <MuscleChips value={newMuscles} onChange={setNewMuscles} />
            <button
              type="submit"
              className="mt-2 w-full rounded-lg border border-zinc-900 py-2 text-sm font-medium text-zinc-900 disabled:opacity-30"
              disabled={!newName.trim() || !newMuscles.length}
            >
              {newName.trim() && !newMuscles.length ? "Pick at least one muscle" : "Add exercise"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** One exercise: last time's top set, sets, volume, and the trend over the last 3 sessions. */
function CandidateRow({
  item,
  today,
  unit,
  checked,
  onToggle,
}: {
  item: HistoryItem;
  today: string;
  unit: Unit;
  checked: boolean;
  onToggle: () => void;
}) {
  const last = item.last;
  let top: string | null = null;
  let vol = 0;
  if (last) {
    vol = exerciseVolume(last, unit);
    if (last.mode === "time") top = formatSet(last.sets.reduce((a, s) => ((s.seconds ?? 0) > (a.seconds ?? 0) ? s : a)), "time", last.unit);
    else {
      const best = last.sets.reduce((a, s) => ((s.weight ?? 0) > (a.weight ?? 0) || ((s.weight ?? 0) === (a.weight ?? 0) && (s.reps ?? 0) > (a.reps ?? 0)) ? s : a));
      top = best.weight
        ? `${Math.round(convert(best.weight, last.unit, unit) * 10) / 10} ${unit} × ${best.reps ?? "–"}`
        : `${best.reps ?? "–"} reps`;
    }
  }
  // trend: last session's work vs the average of the two before it
  const works = item.recent.map((r) => workOf(r)).filter((w) => w > 0);
  let trend: "up" | "down" | "flat" | null = null;
  if (works.length >= 2) {
    const before = works.slice(1, 3);
    const ref = before.reduce((a, b) => a + b, 0) / before.length;
    const q = works[0] / ref;
    trend = q > 1.05 ? "up" : q < 0.95 ? "down" : "flat";
  }
  const trendText = trend === "up" ? "↑ trending up" : trend === "down" ? "↓ lighter than before" : trend === "flat" ? "→ steady" : null;

  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-zinc-900" checked={checked} onChange={onToggle} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{item.name}</span>
            {last && (
              <span className="shrink-0 text-xs text-zinc-500">
                {parseISODate(last.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {daysAgo(last.date, today)}
              </span>
            )}
          </span>
          {last ? (
            <>
              <span className="block text-xs text-zinc-700">
                {top && (
                  <>
                    top <b>{top}</b> ·{" "}
                  </>
                )}
                {last.sets.length} set{last.sets.length === 1 ? "" : "s"}
                {vol > 0 && ` · vol ${formatNumber(vol)} ${unit}`}
                {trendText && (
                  <span className={trend === "up" ? "text-emerald-700" : "text-zinc-500"}>
                    {" · "}
                    {trendText}
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-zinc-500">
                {last.sets.map((s) => formatSet(s, last.mode, last.unit)).join(", ")}
              </span>
            </>
          ) : (
            <span className="block text-xs text-zinc-400">No numbers logged yet</span>
          )}
        </span>
      </label>
    </li>
  );
}
