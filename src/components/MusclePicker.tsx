"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import UnitToggle from "./UnitToggle";
import MuscleChips, { MuscleEditor } from "./MuscleChips";
import { workOf } from "@/lib/effort";
import { Group, Muscle, NO_TAG, Tag, covered, groupLabel, groupsOf, isTagged, muscleLabel, partsOf, tagText } from "@/lib/muscles";
import {
  Mode,
  Section,
  SetEntry,
  Unit,
  WorkoutType,
  convert,
  exerciseVolume,
  formatNumber,
  formatSet,
  parseISODate,
  typeInfo,
} from "@/lib/workout";

/** An exercise from your history. */
export interface HistoryItem {
  name: string;
  types: Set<WorkoutType>;
  sections: Set<Section>;
  last: { date: string; unit: Unit; mode: Mode; sets: SetEntry[] } | null;
  /** up to 3 most recent sessions with numbers, newest first (recent[0] is last) */
  recent: { date: string; unit: Unit; mode: Mode; sets: SetEntry[] }[];
  /** the exercises it was done with in a circuit last time (itself included, in order), or null */
  lastCircuit: string[] | null;
}

export interface RecentSession {
  date: string;
  type: WorkoutType | null;
  effort: number | null;
  /** exercises in this section, in the order done */
  names: string[];
  /** exercises done together as circuits */
  circuits: string[][];
}

const shortDate = (iso: string) => parseISODate(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function daysAgo(iso: string, today: string) {
  const d = Math.round((parseISODate(today).getTime() - parseISODate(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d}d ago` : `${Math.round(d / 7)}w ago`;
}

/**
 * Add exercises by the muscles the day trains: recent sessions that hit those muscles (whatever
 * type the day was), then every matching exercise grouped by muscle group with your last numbers.
 */
export default function MusclePicker({
  date,
  dayMuscles,
  candidates,
  tags,
  sessions,
  taken,
  displayUnit,
  allNames,
  defaultOpen,
  allowMode,
  onAdd,
  onAddNew,
  onTag,
}: {
  date: string;
  dayMuscles: Muscle[];
  /** exercises you've logged in this section before, newest first */
  candidates: HistoryItem[];
  /** tags per exercise, by lower-case name */
  tags: Map<string, Tag>;
  /** earlier days, newest first */
  sessions: RecentSession[];
  /** lower-case names already on this day */
  taken: Set<string>;
  displayUnit: Unit;
  allNames: string[];
  defaultOpen: boolean;
  /** new exercises can be timed (core) */
  allowMode?: boolean;
  /** asCircuit: add them as one circuit */
  onAdd: (names: string[], asCircuit: boolean) => void;
  onAddNew: (name: string, unit: Unit, mode: Mode, muscles: Muscle[]) => void;
  onTag: (name: string, muscles: Muscle[]) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<Group | null>(null);
  const [part, setPart] = useState<Muscle | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [showUntagged, setShowUntagged] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<Unit>("kg");
  const [newMode, setNewMode] = useState<Mode>("reps");
  const [newMuscles, setNewMuscles] = useState<Muscle[]>([]);
  const listId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const keepInView = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })));

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const dayKey = dayMuscles.join(",");
  useEffect(() => {
    setGroup(null);
    setPart(null);
  }, [dayKey]);

  const tagOf = (name: string) => tags.get(name.toLowerCase()) ?? NO_TAG;
  /** the day's muscles this exercise works */
  const hitsOf = (name: string) => covered(tagOf(name)).filter((m) => dayMuscles.includes(m));

  const available = useMemo(() => candidates.filter((c) => !taken.has(c.name.toLowerCase())), [candidates, taken]);
  const byName = useMemo(() => new Map(available.map((c) => [c.name.toLowerCase(), c])), [available]);

  // drop checks for exercises that are no longer offered
  useEffect(() => {
    setChecked((prev) => {
      const next = new Set([...prev].filter((n) => byName.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [byName]);

  const matching = available.filter((c) => hitsOf(c.name).length);
  // never tagged, or tagged with an old broad group that needs a part
  const needsTag = available
    .filter((c) => !isTagged(tagOf(c.name)) || tagOf(c.name).legacy.length)
    .sort((a, b) => Number(isTagged(tagOf(b.name))) - Number(isTagged(tagOf(a.name))));

  const dayGroups = groupsOf(dayMuscles);
  const focus = part ? [part] : group ? partsOf(group).filter((m) => dayMuscles.includes(m)) : dayMuscles;
  const sections = groupsOf(focus)
    .map((g) => ({ group: g, items: matching.filter((c) => hitsOf(c.name).some((m) => focus.includes(m) && partsOf(g).includes(m))) }))
    .filter((s) => s.items.length);

  const recent = sessions
    .map((s) => ({ ...s, match: s.names.filter((n) => hitsOf(n).length) }))
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

  const addSelected = (asCircuit = false) => {
    onAdd(
      available.filter((c) => checked.has(c.name.toLowerCase())).map((c) => c.name),
      asCircuit
    );
    setChecked(new Set());
    keepInView();
  };

  const addNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newMuscles.length) return;
    onAddNew(newName.trim(), newUnit, newMode, newMuscles);
    setNewName("");
    setNewMuscles([]);
    keepInView();
  };

  const typedKnown = tags.get(newName.trim().toLowerCase());
  const chip = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-medium ${on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`;
  const untaggedOpen = showUntagged || !matching.length;

  return (
    <div ref={panel} className="scroll-mb-24 rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium"
      >
        <span>
          + Add exercises
          <span className="ml-2 font-normal text-zinc-500">
            {matching.length ? `${matching.length} for ${dayGroups.map(groupLabel).join(", ").toLowerCase()}` : ""}
          </span>
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
                        {s.match.map((n, i) => {
                          const c = s.circuits.find((x) => x.includes(n));
                          const first = c && s.match.find((m) => c.includes(m)) === n;
                          const lastOne = c && [...s.match].reverse().find((m) => c.includes(m)) === n;
                          return (
                            <span key={n}>
                              {i > 0 && (c && !first ? " + " : ", ")}
                              {first && <span className="text-indigo-600">↻ (</span>}
                              <span className={byName.has(n.toLowerCase()) ? "" : "text-zinc-400 line-through"}>{n}</span>
                              {lastOne && <span className="text-indigo-600">)</span>}
                            </span>
                          );
                        })}
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
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">By muscle</h3>
            {dayGroups.length > 1 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {[null, ...dayGroups].map((g) => (
                  <button
                    key={g ?? "all"}
                    type="button"
                    aria-pressed={group === g}
                    onClick={() => {
                      setGroup(g);
                      setPart(null);
                    }}
                    className={chip(group === g)}
                  >
                    {g ? groupLabel(g) : "All"}
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const parts = dayGroups.length > 1 ? (group ? partsOf(group).filter((m) => dayMuscles.includes(m)) : []) : dayMuscles;
              if (parts.length < 2) return null;
              return (
                <div className="mb-2 flex flex-wrap gap-1.5 border-l-2 border-zinc-200 pl-2">
                  {[null, ...parts].map((m) => (
                    <button key={m ?? "any"} type="button" aria-pressed={part === m} onClick={() => setPart(m)} className={chip(part === m)}>
                      {m ? muscleLabel(m) : `Any ${group ? groupLabel(group).toLowerCase() : "part"}`}
                    </button>
                  ))}
                </div>
              );
            })()}

            {sections.length ? (
              <div className="max-h-[28rem] overflow-y-auto">
                {sections.map((sec) => (
                  <div key={sec.group} className="mb-2">
                    <div className="sticky top-0 bg-white py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700">
                      {groupLabel(sec.group)}
                    </div>
                    <ul className="divide-y divide-zinc-100">
                      {sec.items.map((c) => (
                        <CandidateRow
                          key={c.name}
                          item={c}
                          tag={tagOf(c.name)}
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
                  ? `No tagged exercises for ${(part ? [muscleLabel(part)] : (group ? [group] : dayGroups).map(groupLabel)).join(", ").toLowerCase()} yet. Tag your exercises below, or add a new one.`
                  : "Nothing else from history to add. Add a new exercise below."}
              </p>
            )}
          </section>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={checked.size === 0}
              onClick={() => addSelected()}
              className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-30"
            >
              Add selected ({checked.size})
            </button>
            {checked.size > 1 && (
              <button
                type="button"
                onClick={() => addSelected(true)}
                className="shrink-0 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2.5 text-sm font-medium text-indigo-800"
                title="Add them as one circuit, done back to back"
              >
                ↻ As circuit
              </button>
            )}
          </div>
          {checked.size > 1 && (
            <p className="mt-1 text-[11px] text-zinc-500">
              Exercises you last did together in a circuit go back into one automatically. ↻ As circuit puts all the selected ones into a
              single circuit.
            </p>
          )}

          {/* exercises that need tags */}
          {needsTag.length > 0 && (
            <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
              <button
                type="button"
                onClick={() => setShowUntagged((v) => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-amber-900"
              >
                <span>
                  {needsTag.length} exercise{needsTag.length === 1 ? "" : "s"} to tag
                  <span className="block text-xs font-normal text-amber-800">
                    Tag the muscles once and they&apos;ll show up on the right days.
                  </span>
                </span>
                <span className="text-amber-700">{untaggedOpen ? "▲" : "▼"}</span>
              </button>
              {untaggedOpen && (
                <ul className="mt-2 divide-y divide-amber-100">
                  {needsTag.map((c) => {
                    const t = tagOf(c.name);
                    return (
                      <li key={c.name} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{c.name}</span>
                            <span className="block text-xs text-zinc-500">
                              {isTagged(t)
                                ? tagText(t)
                                : [...c.types].map((x) => typeInfo(x)?.label).filter(Boolean).join(", ") || "Not tagged"}
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
                            initial={t.muscles}
                            legacy={t.legacy}
                            onCancel={() => setTagging(null)}
                            onSave={(m) => {
                              onTag(c.name, m);
                              setTagging(null);
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
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
                  if (known?.muscles.length) setNewMuscles(known.muscles);
                }}
                placeholder={allowMode ? "e.g. Plank" : "e.g. Incline Dumbbell Press"}
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
            </div>
            <p className="mb-1.5 mt-2 text-xs text-zinc-600">
              Muscles it works{typedKnown?.muscles.length ? " (saved before, change if needed)" : ""}:
            </p>
            <MuscleChips value={newMuscles} onChange={setNewMuscles} highlight={typedKnown?.legacy} />
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

/** One exercise: its muscles, last time's top set, sets, volume, and the trend over the last 3 sessions. */
function CandidateRow({
  item,
  tag,
  today,
  unit,
  checked,
  onToggle,
}: {
  item: HistoryItem;
  tag: Tag;
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
      const best = last.sets.reduce((a, s) =>
        (s.weight ?? 0) > (a.weight ?? 0) || ((s.weight ?? 0) === (a.weight ?? 0) && (s.reps ?? 0) > (a.reps ?? 0)) ? s : a
      );
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
    const q = works[0] / (before.reduce((a, b) => a + b, 0) / before.length);
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
          <span className={`block text-[11px] ${tag.legacy.length ? "text-amber-800" : "text-zinc-500"}`}>{tagText(tag)}</span>
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
