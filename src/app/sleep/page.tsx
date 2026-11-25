"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/AppNav";
import SleepTimeline from "@/components/SleepTimeline";
import { DaySummary, addDays, datesBetween, loadRange } from "@/lib/daily";
import {
  CYCLE_MIN,
  FALL_ASLEEP_MIN,
  FORGOTTEN_MIN,
  SLEEP_GOALS,
  SLEEP_GOAL_KEY,
  SleepNight,
  SleepSession,
  addMinutes,
  allZones,
  deviceZone,
  elapsedMinutes,
  formatClock,
  formatDuration,
  formatWallDate,
  fromMinutes,
  mainSleep,
  momentOf,
  nowMs,
  readSleepGoal,
  toMinutes,
  wallAt,
  wallDate,
  wallTime,
  zoneCity,
  zoneNote,
} from "@/lib/sleep";
import { deleteSleep, loadOpenSleep, saveSleep } from "@/lib/sleepStore";

const ROWS = 14;

/** One end of a sleep in the form: clock time + zone, and the exact moment it came from (if saved). */
type End = { wall: string; tz: string; saved?: number };
/** Which sleep the form is editing. `mode` decides which fields it shows. */
type Form = { mode: "past" | "bed" | "wake"; id?: string; bed: End; wake: End };

const savedEnd = (ms: number, tz: string): End => ({ wall: wallAt(ms, tz), tz, saved: ms });
const newEnd = (wall: string): End => ({ wall, tz: deviceZone() });
/** The moment an end stands for. Unchanged ends keep their exact moment. NaN when empty. */
function endMoment(e: End) {
  if (!e.wall) return NaN;
  if (e.saved != null && wallAt(e.saved, e.tz) === e.wall) return e.saved;
  return momentOf(e.wall, e.tz);
}
const deviceWall = () => wallAt(Date.now(), deviceZone());

export default function SleepPage() {
  const [nowAt, setNowAt] = useState(() => Date.now());
  const [end, setEnd] = useState(() => wallDate(deviceWall()));
  const [highlight, setHighlight] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<SleepSession | null>(null);
  const [days, setDays] = useState<Record<string, DaySummary>>({});
  const [goal, setGoal] = useState(480);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  /** the sleep you just ended, shown until confirmed */
  const [justWoke, setJustWoke] = useState<string | null>(null);

  const now = wallAt(nowAt, deviceZone());
  const today = wallDate(now);

  // keep the clock current, also when the phone is unlocked
  useEffect(() => {
    const tick = () => setNowAt(Date.now());
    const t = setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // left open past midnight: keep the list on today if that's where it was
  const lastToday = useRef(today);
  useEffect(() => {
    const was = lastToday.current;
    lastToday.current = today;
    if (was !== today) setEnd((e) => (e === was ? today : e));
  }, [today]);

  // /sleep?date=2026-11-25 (from the calendar) opens the list around that day
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const t = wallDate(deviceWall());
      const e = addDays(d, 3);
      setHighlight(d);
      setEnd(e > t ? t : e);
    }
    setGoal(readSleepGoal());
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    const [o, r] = await Promise.all([loadOpenSleep(), loadRange(addDays(end, 1 - ROWS), end)]);
    setOpen(o.open);
    setDays(r.days);
    setError(o.error ?? r.error);
    setLoading(false);
  }, [end]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // another device may have started or ended the sleep
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && ready) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, load]);

  const nights = useMemo(() => Object.values(days).flatMap((d) => d.nights), [days]);
  const woke = nights.find((n) => n.id === justWoke) ?? null;

  /** Runs a change, then reloads. Returns whether it worked. */
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await action();
    await load();
    setBusy(false);
    if (err) setError(err);
    return !err;
  };

  const goToBed = async () => {
    setJustWoke(null);
    await run(() => saveSleep({ bedAt: nowMs(), bedTz: deviceZone(), wakeAt: null, wakeTz: null }));
  };

  const wakeUp = async () => {
    if (!open) return;
    const s = { ...open, wakeAt: nowMs(), wakeTz: deviceZone() };
    setEnd(wallDate(wallAt(s.wakeAt, s.wakeTz)));
    if (await run(() => saveSleep(s, true))) setJustWoke(s.id);
  };

  const submitForm = async () => {
    if (!form) return;
    const f = form;
    const inBed = f.mode === "bed";
    const ok = await run(() =>
      saveSleep(
        {
          id: f.id,
          bedAt: endMoment(f.bed),
          bedTz: f.bed.tz,
          wakeAt: inBed ? null : endMoment(f.wake),
          wakeTz: inBed ? null : f.wake.tz,
        },
        f.mode !== "past"
      )
    );
    if (!ok) return;
    setForm(null);
    if (f.mode === "wake" && f.id) {
      setEnd(today);
      setJustWoke(f.id);
    }
  };

  const remove = async (id: string, question: string) => {
    if (!confirm(question)) return;
    if (await run(() => deleteSleep(id))) {
      setForm(null);
      setJustWoke(null);
    }
  };

  const pickGoal = (g: number) => {
    setGoal(g);
    try {
      localStorage.setItem(SLEEP_GOAL_KEY, String(g));
    } catch {}
    load(); // the estimates use the goal
  };

  const edit = (n: SleepNight) => {
    setError(null);
    setForm({ mode: "past", id: n.id, bed: savedEnd(n.bedAt, n.bedTz), wake: savedEnd(n.wakeAt, n.wakeTz) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addPast = () => {
    const d = highlight ?? today;
    setError(null);
    setForm({ mode: "past", bed: newEnd(`${addDays(d, -1)}T23:00`), wake: newEnd(`${d}T07:00`) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dates = useMemo(() => datesBetween(addDays(end, 1 - ROWS), end).reverse(), [end]);
  const totals = useMemo(() => Object.fromEntries(dates.map((d) => [d, days[d]?.sleepMin ?? null])), [dates, days]);
  const logged = dates.flatMap((d) => (totals[d] != null ? [totals[d]!] : []));
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null;
  const lastMain = dates.map((d) => mainSleep(days[d]?.nights ?? [])).find(Boolean) ?? null;
  const usualWake = lastMain ? toMinutes(wallTime(lastMain.wake)) : null;

  const elapsed = open ? elapsedMinutes(open.bedAt, nowAt) : 0;
  const openBed = open ? wallAt(open.bedAt, open.bedTz) : "";
  const formMinutes = form && form.mode !== "bed" ? elapsedMinutes(endMoment(form.bed), endMoment(form.wake)) : 0;
  // forgotten, or the phone's clock was set back past the bedtime
  const needsWakeTime = !!open && (elapsed > FORGOTTEN_MIN || elapsed < -1);

  if (loading) return <div className="flex min-h-dvh items-center justify-center text-zinc-400">Loading…</div>;

  return (
    <main className="mx-auto max-w-2xl px-3 pb-10 pt-4 sm:px-6">
      <AppNav current="sleep" />
      <h1 className="sr-only">Sleep</h1>

      {error && <p className="mb-3 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}

      {form ? (
        <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">
            {form.mode === "bed" ? "When did you go to bed?" : form.mode === "wake" ? "When did you wake up?" : form.id ? "Edit sleep" : "Add a past sleep"}
          </h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitForm();
            }}
          >
            <DateTime label="Went to bed" value={form.bed} onChange={(v) => setForm({ ...form, bed: v })} />
            {form.mode !== "bed" && <DateTime label="Woke up" value={form.wake} onChange={(v) => setForm({ ...form, wake: v })} />}
            {formMinutes > 0 && <p className="text-sm text-zinc-600">{formatDuration(formMinutes)} in bed</p>}
            <div className="flex items-center justify-end gap-2">
              {form.mode === "past" && form.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(form.id!, "Delete this sleep?")}
                  className="mr-auto px-2 py-2 text-sm text-red-600 hover:underline"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setError(null);
                }}
                className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-200"
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white disabled:opacity-40">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </section>
      ) : open ? (
        <section className="mb-4 rounded-2xl bg-indigo-950 px-4 py-8 text-center text-white">
          <p className="text-sm text-indigo-200">
            In bed since {formatClock(wallTime(openBed))}, {formatWallDate(openBed)}
            {zoneNote(open.bedAt, open.bedTz)}
          </p>
          {needsWakeTime ? (
            <>
              <p className="my-4">That&apos;s a long time ago. When did you wake up?</p>
              <BigButton disabled={busy} onClick={() => setForm({ mode: "wake", id: open.id, bed: savedEnd(open.bedAt, open.bedTz), wake: newEnd("") })}>
                Enter wake-up time
              </BigButton>
            </>
          ) : (
            <>
              <p className="my-4 text-5xl font-semibold tabular-nums">{formatDuration(elapsed)}</p>
              <BigButton disabled={busy || elapsed < 1} onClick={wakeUp}>
                {busy ? "Saving…" : "I'm awake"}
              </BigButton>
            </>
          )}
          <div className="mt-4 flex justify-center gap-4 text-sm text-indigo-200">
            <button type="button" className="py-1 underline" onClick={() => setForm({ mode: "bed", id: open.id, bed: savedEnd(open.bedAt, open.bedTz), wake: newEnd("") })}>
              Change bedtime
            </button>
            <button type="button" className="py-1 underline" disabled={busy} onClick={() => remove(open.id, "Cancel this sleep? It won't be logged.")}>
              Cancel
            </button>
          </div>
        </section>
      ) : woke ? (
        <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">{woke.nap ? "Nap" : "Good morning"}</p>
          <p className="text-3xl font-semibold">≈ {formatDuration(woke.asleep)} asleep</p>
          <p className="mt-1 text-sm text-zinc-600">
            In bed {formatClock(wallTime(woke.bed))}, {formatWallDate(woke.bed)}
            {zoneNote(woke.bedAt, woke.bedTz)} to {formatClock(wallTime(woke.wake))}, {formatWallDate(woke.wake)}
            {zoneNote(woke.wakeAt, woke.wakeTz)}
          </p>
          <Estimate n={woke} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => edit(woke)} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm">
              Edit
            </button>
            <button type="button" onClick={() => setJustWoke(null)} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white">
              Looks right
            </button>
          </div>
        </section>
      ) : (
        <section className="mb-4 rounded-2xl bg-indigo-950 px-4 py-8 text-center text-white">
          <p className="text-4xl font-semibold tabular-nums">{formatClock(wallTime(now))}</p>
          <p className="mb-5 mt-1 text-sm text-indigo-200">{formatWallDate(now)}</p>
          <BigButton disabled={busy} onClick={goToBed}>
            {busy ? "Saving…" : "I'm going to bed"}
          </BigButton>
          <p className="mt-3 text-xs text-indigo-200">Tap when you stop doing anything. Works for naps too.</p>
          <button type="button" className="mt-2 py-1 text-sm text-indigo-200 underline" onClick={() => setForm({ mode: "bed", bed: newEnd(now), wake: newEnd("") })}>
            Went to bed earlier?
          </button>
        </section>
      )}

      {!woke && !open && !form && lastMain && wallDate(lastMain.wake) === today && (
        <LastSleep n={nights.filter((n) => wallDate(n.wake) === today && !n.nap).sort((a, b) => b.asleep - a.asleep)[0]} total={totals[today]} goal={goal} />
      )}

      <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Nights</h2>
            <p className="text-xs text-zinc-500">
              {avg == null ? "Nothing logged in these two weeks" : `Average ${formatDuration(avg)} over ${logged.length} days`}
            </p>
          </div>
          <div className="flex gap-1">
            <button type="button" aria-label="Older" onClick={() => setEnd(addDays(end, -ROWS))} className="rounded-md px-3 py-1.5 text-lg hover:bg-zinc-100">
              ‹
            </button>
            <button
              type="button"
              aria-label="Newer"
              disabled={end >= today}
              onClick={() => {
                const e = addDays(end, ROWS);
                setEnd(e > today ? today : e);
              }}
              className="rounded-md px-3 py-1.5 text-lg hover:bg-zinc-100 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
        <SleepTimeline dates={dates} nights={nights} totals={totals} highlight={highlight} onPick={edit} />
        <p className="mt-2 text-xs text-zinc-500">A sleep counts for the day you woke up. Tap one to edit it.</p>
        <button type="button" onClick={addPast} className="mt-3 w-full rounded-md border border-zinc-300 py-2 text-sm hover:bg-zinc-50">
          + Add a past sleep
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Sleep goal</h2>
          <div className="flex rounded-md border border-zinc-300 bg-white text-xs">
            {SLEEP_GOALS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => pickGoal(g)}
                className={`px-2 py-1.5 first:rounded-l-md last:rounded-r-md ${goal === g ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              >
                {formatDuration(g)}
              </button>
            ))}
          </div>
        </div>
        {usualWake != null ? (
          <>
            <p className="text-sm text-zinc-700">
              To wake at <b>{formatClock(fromMinutes(usualWake))}</b> again with {formatDuration(goal)} of sleep, be in bed by{" "}
              <b>{formatClock(fromMinutes(usualWake - goal - FALL_ASLEEP_MIN))}</b>.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Or aim for whole {CYCLE_MIN}-minute cycles, allowing about {FALL_ASLEEP_MIN} minutes to fall asleep:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[6, 5, 4].map((c) => (
                <span key={c} className="rounded-md bg-zinc-100 px-2 py-1 text-xs">
                  <b>{formatClock(fromMinutes(usualWake - FALL_ASLEEP_MIN - c * CYCLE_MIN))}</b> · {c} cycles ({formatDuration(c * CYCLE_MIN)})
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Log a night to see when to go to bed.</p>
        )}
      </section>
    </main>
  );
}

function BigButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full max-w-xs rounded-2xl bg-white px-6 py-5 text-lg font-semibold text-indigo-950 active:bg-indigo-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function DateTime({ label, value, onChange }: { label: string; value: End; onChange: (v: End) => void }) {
  // only shown when it matters: the saved zone isn't this device's, or you ask for it
  const [picking, setPicking] = useState(value.tz !== deviceZone());
  const zones = useMemo(() => [...new Set([value.tz, deviceZone(), ...allZones()])].sort(), [value.tz]);
  return (
    <div>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs text-zinc-500">{label}</span>
        <input
          type="datetime-local"
          required
          value={value.wall}
          onChange={(e) => onChange({ ...value, wall: e.target.value.slice(0, 16) })}
          className="block h-11 w-full min-w-0 appearance-none rounded-md border border-zinc-300 bg-white px-2 text-left text-base outline-none focus:border-zinc-900 [&::-webkit-date-and-time-value]:text-left"
        />
      </label>
      {picking ? (
        <select
          aria-label={`${label}: time zone`}
          value={value.tz}
          onChange={(e) => onChange({ ...value, tz: e.target.value })}
          className="mt-1 block h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-base"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={() => setPicking(true)} className="mt-1 py-0.5 text-xs text-zinc-500 underline">
          {zoneCity(value.tz)} time. Different time zone?
        </button>
      )}
    </div>
  );
}

function Estimate({ n }: { n: SleepNight }) {
  if (n.nap) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer py-1 text-zinc-600">
        Took ≈ {n.latency} min to fall asleep (around {formatClock(wallTime(addMinutes(n.bed, n.latency)))})
      </summary>
      <ul className="mt-1 space-y-1 text-xs text-zinc-600">
        <li className="flex justify-between gap-2">
          <span>Typical for most people</span>
          <span>{FALL_ASLEEP_MIN} min</span>
        </li>
        {n.factors.map((f) => (
          <li key={f.label} className="flex justify-between gap-2">
            <span>{f.label}</span>
            <span className={f.minutes > 0 ? "text-amber-700" : "text-emerald-700"}>
              {f.minutes > 0 ? "+" : "−"}
              {Math.abs(f.minutes)} min
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-zinc-400">An educated guess, kept between 5 and 60 minutes.</p>
    </details>
  );
}

function LastSleep({ n, total, goal }: { n: SleepNight | undefined; total: number | null; goal: number }) {
  if (!n || total == null) return null;
  const diff = Math.round(total - goal);
  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Today</h2>
        <span className="text-lg font-semibold">≈ {formatDuration(total)}</span>
      </div>
      <p className={`text-sm ${diff >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
        {diff >= 0 ? `You hit your ${formatDuration(goal)} goal.` : `${formatDuration(-diff)} short of your ${formatDuration(goal)} goal.`}
      </p>
      <Estimate n={n} />
    </section>
  );
}
