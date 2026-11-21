"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import UnitToggle from "@/components/UnitToggle";
import ExerciseCard from "@/components/ExerciseCard";
import ExercisePicker, { HistoryItem } from "@/components/ExercisePicker";
import {
  ExerciseEntry,
  Mode,
  Section,
  SetEntry,
  Unit,
  WORKOUT_TYPES,
  WorkoutType,
  dayTotals,
  formatNumber,
  formatSeconds,
  newKey,
  parseISODate,
  toISODate,
  typeInfo,
} from "@/lib/workout";

interface RawRow {
  section: Section;
  position?: number;
  unit: Unit;
  mode: Mode;
  sets: SetEntry[];
  exercises: { name: string } | null;
  workout_days?: { date: string; type: WorkoutType | null } | null;
}

const hasData = (s: SetEntry) => !!(s.reps || s.weight || s.seconds);

export default function DayPage() {
  const params = useParams<{ date: string }>();
  const date = params.date;
  const router = useRouter();
  const [displayUnit, setDisplayUnit] = useDisplayUnit();

  const [type, setType] = useState<WorkoutType | null>(null);
  const [items, setItems] = useState<ExerciseEntry[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dateObj = useMemo(() => parseISODate(date), [date]);

  // ---------- load ----------
  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const sb = supabase();

    const dayReq = sb
      .from("workout_days")
      .select("type, day_exercises(section, position, unit, mode, sets, exercises(name))")
      .eq("date", date)
      .maybeSingle();

    // all previous sessions (paged, Supabase returns max 1000 rows per request)
    const histRows: RawRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("day_exercises")
        .select("section, unit, mode, sets, exercises(name), workout_days!inner(date, type)")
        .lt("workout_days.date", date)
        .range(from, from + PAGE - 1);
      if (error) {
        setMessage({ kind: "err", text: error.message });
        break;
      }
      histRows.push(...((data ?? []) as unknown as RawRow[]));
      if (!data || data.length < PAGE) break;
    }

    const { data: day, error: dayErr } = await dayReq;
    if (dayErr) setMessage({ kind: "err", text: dayErr.message });

    // build history: per exercise, most recent session (any workout type) + which types/sections it was done in
    const map = new Map<string, HistoryItem>();
    for (const r of histRows) {
      const name = r.exercises?.name;
      const wd = r.workout_days;
      if (!name || !wd) continue;
      const key = name.toLowerCase();
      let h = map.get(key);
      if (!h) {
        h = { name, types: new Set(), sections: new Set(), last: null };
        map.set(key, h);
      }
      if (wd.type) h.types.add(wd.type);
      h.sections.add(r.section);
      const sets = (r.sets ?? []).filter(hasData);
      if (sets.length && (!h.last || wd.date > h.last.date)) {
        h.last = { date: wd.date, unit: r.unit, mode: r.mode, sets };
      }
    }
    setHistory([...map.values()].sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? "")));

    const rows = ((day?.day_exercises ?? []) as unknown as RawRow[]).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    );
    setType((day?.type as WorkoutType) ?? null);
    setItems(
      rows.map((r) => ({
        key: newKey(),
        name: r.exercises?.name ?? "Exercise",
        section: r.section,
        unit: r.unit,
        mode: r.mode,
        sets: r.sets ?? [],
      }))
    );
    setDirty(false);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---------- mutations ----------
  const change = (fn: (prev: ExerciseEntry[]) => ExerciseEntry[]) => {
    setItems(fn);
    setDirty(true);
    setMessage(null);
  };

  const historyByName = useMemo(() => {
    const m = new Map<string, HistoryItem>();
    for (const h of history) m.set(h.name.toLowerCase(), h);
    return m;
  }, [history]);

  const addExercises = (names: string[], section: Section, opts?: { unit?: Unit; mode?: Mode }) => {
    change((prev) => {
      const existing = new Set(prev.filter((p) => p.section === section).map((p) => p.name.toLowerCase()));
      const added: ExerciseEntry[] = [];
      for (const raw of names) {
        const name = raw.trim();
        if (!name || existing.has(name.toLowerCase())) continue;
        existing.add(name.toLowerCase());
        const h = historyByName.get(name.toLowerCase());
        const last = h?.last;
        added.push({
          key: newKey(),
          name: h?.name ?? name,
          section,
          unit: last?.unit ?? opts?.unit ?? "kg",
          mode: last?.mode ?? opts?.mode ?? "reps",
          // prefill with last session's numbers so you can bump them up
          sets: last ? last.sets.map((s) => ({ ...s })) : [{ reps: null, weight: null, seconds: null }],
        });
      }
      return [...prev, ...added];
    });
  };

  const updateItem = (key: string, next: ExerciseEntry) => change((prev) => prev.map((p) => (p.key === key ? next : p)));
  const removeItem = (key: string) => change((prev) => prev.filter((p) => p.key !== key));
  const moveItem = (key: string, dir: -1 | 1) =>
    change((prev) => {
      const list = [...prev];
      const i = list.findIndex((p) => p.key === key);
      const section = list[i].section;
      let j = i + dir;
      while (j >= 0 && j < list.length && list[j].section !== section) j += dir;
      if (j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });

  const pickType = (t: WorkoutType) => {
    setType((cur) => (cur === t ? null : t));
    setDirty(true);
    setMessage(null);
  };

  // ---------- save ----------
  const save = async (override?: { type: WorkoutType | null; items: ExerciseEntry[] }) => {
    setSaving(true);
    setMessage(null);
    const t = override ? override.type : type;
    const list = override ? override.items : items;
    const payload = list.map((i) => ({
      name: i.name,
      section: i.section,
      unit: i.unit,
      mode: i.mode,
      sets: i.sets.map((s) => ({ reps: s.reps, weight: s.weight, seconds: s.seconds })),
    }));
    const { error } = await supabase().rpc("save_day", { p_date: date, p_type: t, p_items: payload });
    setSaving(false);
    if (error) {
      setMessage({ kind: "err", text: error.message });
      return false;
    }
    setDirty(false);
    setMessage({ kind: "ok", text: "Saved" });
    return true;
  };

  const clearDay = async () => {
    if (!confirm("Clear everything logged for this day?")) return;
    setType(null);
    setItems([]);
    await save({ type: null, items: [] });
  };

  const goto = (offset: number) => {
    if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
    const d = new Date(dateObj);
    d.setDate(d.getDate() + offset);
    router.push(`/day/${toISODate(d)}`);
  };

  const back = (e: React.MouseEvent) => {
    if (dirty && !confirm("You have unsaved changes. Leave anyway?")) e.preventDefault();
  };

  // ---------- derived ----------
  const mainItems = useMemo(() => items.filter((i) => i.section === "main"), [items]);
  const coreItems = useMemo(() => items.filter((i) => i.section === "core"), [items]);
  const totals = dayTotals(items, displayUnit);
  const info = typeInfo(type);
  const showMain = (type && type !== "rest") || mainItems.length > 0;

  const mainCandidates = useMemo(() => {
    if (!type || type === "rest") return [];
    const taken = new Set(mainItems.map((i) => i.name.toLowerCase()));
    return history.filter((h) => h.sections.has("main") && h.types.has(type) && !taken.has(h.name.toLowerCase()));
  }, [history, type, mainItems]);

  const coreCandidates = useMemo(() => {
    const taken = new Set(coreItems.map((i) => i.name.toLowerCase()));
    return history.filter((h) => h.sections.has("core") && !taken.has(h.name.toLowerCase()));
  }, [history, coreItems]);

  const allNames = useMemo(() => history.map((h) => h.name), [history]);

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-zinc-400">Loading…</div>;
  }

  return (
    <main className="mx-auto max-w-2xl px-3 pb-32 pt-4 sm:px-6">
      {/* header */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link href="/" onClick={back} className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200">
          ‹ Calendar
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={() => goto(-1)} className="rounded-md px-2 py-1 text-lg hover:bg-zinc-200" aria-label="Previous day">
            ‹
          </button>
          <h1 className="text-center text-base font-semibold sm:text-lg">
            {dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </h1>
          <button onClick={() => goto(1)} className="rounded-md px-2 py-1 text-lg hover:bg-zinc-200" aria-label="Next day">
            ›
          </button>
        </div>
        <UnitToggle unit={displayUnit} onChange={setDisplayUnit} />
      </header>

      {/* workout type */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Workout type</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {WORKOUT_TYPES.map((w) => (
            <button
              key={w.value}
              onClick={() => pickType(w.value)}
              className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                type === w.value ? `${w.color} border-transparent text-white` : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </section>

      {/* day totals */}
      <section className="mb-5 grid grid-cols-3 gap-2 text-center">
        <Total label={`Volume (${displayUnit})`} value={formatNumber(totals.volume)} />
        <Total label="Working sets" value={String(totals.sets)} />
        <Total
          label="Core"
          value={totals.coreSets ? `${totals.coreSets} sets${totals.coreSeconds ? ` · ${formatSeconds(totals.coreSeconds)}` : ""}` : "–"}
        />
      </section>

      {/* main workout */}
      {showMain && (
        <section className="mb-8">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
            {info && type !== "rest" && <span className={`h-3 w-3 rounded-sm ${info.color}`} />}
            {info && type !== "rest" ? `${info.label} workout` : "Workout"}
          </h2>

          {type && type !== "rest" && (
            <ExercisePicker
              title={`From previous ${info?.label} days`}
              candidates={mainCandidates}
              allNames={allNames}
              defaultOpen={mainItems.length === 0}
              onAdd={(names) => addExercises(names, "main")}
              onAddNew={(name, unit) => addExercises([name], "main", { unit, mode: "reps" })}
            />
          )}

          <div className="mt-3 space-y-3">
            {mainItems.map((it, idx) => (
              <ExerciseCard
                key={it.key}
                entry={it}
                last={historyByName.get(it.name.toLowerCase())?.last ?? null}
                displayUnit={displayUnit}
                onChange={(n) => updateItem(it.key, n)}
                onRemove={() => removeItem(it.key)}
                onMove={(d) => moveItem(it.key, d)}
                isFirst={idx === 0}
                isLast={idx === mainItems.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* core */}
      <section className="mb-8">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <span className="rounded bg-teal-100 px-1.5 text-xs font-bold text-teal-700">CORE</span> Core session
        </h2>
        <ExercisePicker
          title="Previous core exercises"
          candidates={coreCandidates}
          allNames={allNames}
          defaultOpen={false}
          allowMode
          onAdd={(names) => addExercises(names, "core")}
          onAddNew={(name, unit, mode) => addExercises([name], "core", { unit, mode })}
        />
        <div className="mt-3 space-y-3">
          {coreItems.map((it, idx) => (
            <ExerciseCard
              key={it.key}
              entry={it}
              last={historyByName.get(it.name.toLowerCase())?.last ?? null}
              displayUnit={displayUnit}
              allowMode
              onChange={(n) => updateItem(it.key, n)}
              onRemove={() => removeItem(it.key)}
              onMove={(d) => moveItem(it.key, d)}
              isFirst={idx === 0}
              isLast={idx === coreItems.length - 1}
            />
          ))}
        </div>
      </section>

      {(type || items.length > 0) && (
        <div className="text-center">
          <button onClick={clearDay} className="text-sm text-red-600 hover:underline">
            Clear this day
          </button>
        </div>
      )}

      {/* sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className={`text-sm ${message?.kind === "err" ? "text-red-600" : "text-zinc-500"}`}>
            {message ? message.text : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            onClick={() => save()}
            disabled={saving || !dirty}
            className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2">
      <div className="text-base font-semibold sm:text-lg">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
