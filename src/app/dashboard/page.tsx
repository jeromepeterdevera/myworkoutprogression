"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppNav from "@/components/AppNav";
import UnitToggle from "@/components/UnitToggle";
import TimeChart, { Series } from "@/components/TimeChart";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import { DaySummary, loadRange } from "@/lib/daily";
import { MEALS_ENABLED } from "@/lib/features";
import { profileComplete } from "@/lib/activity";
import { formatDuration } from "@/lib/sleep";
import { convert, parseISODate, toISODate } from "@/lib/workout";

// validated palette (dataviz reference slots 1 & 2, diverging blue/red) on a white surface
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const RED = "#e34948";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];
const RANGE_KEY = "dashboard-range";
const KCAL_PER_KG = 7700;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

export default function DashboardPage() {
  const [unit, setUnit] = useDisplayUnit();
  const [range, setRange] = useState(30);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [hasProfile, setHasProfile] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const r = Number(localStorage.getItem(RANGE_KEY));
      if (RANGES.some((x) => x.days === r)) setRange(r);
    } catch {}
  }, []);
  const pickRange = (r: number) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - range + 1);
    setLoading(true);
    loadRange(toISODate(from), toISODate(to)).then((res) => {
      if (cancelled) return;
      setError(res.error);
      setDays(Object.values(res.days).sort((a, b) => a.date.localeCompare(b.date)));
      setHasProfile(profileComplete(res.profile));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const totalBurn = (d: DaySummary) => (d.baseline != null ? d.baseline + d.exerciseKcal : null);

  // ---------- headline numbers ----------
  const tiles = useMemo(() => {
    const ws = days.flatMap((d) => (d.weightKg != null ? [convert(d.weightKg, "kg", unit)] : []));
    const sleep = days.flatMap((d) => (d.sleepMin != null ? [d.sleepMin] : []));
    const eaten = days.flatMap((d) => (d.intake != null ? [d.intake] : []));
    const protein = days.flatMap((d) => (d.protein != null ? [d.protein] : []));
    const burn = days.flatMap((d) => {
      const b = totalBurn(d);
      return b != null ? [b] : [];
    });
    const workouts = days.filter((d) => d.exerciseKcal >= 1).map((d) => d.exerciseKcal);
    const bal = days.flatMap((d) => (d.balance != null ? [d.balance] : []));
    const avgBal = avg(bal);
    const perWeekKg = avgBal == null ? null : (avgBal * 7) / KCAL_PER_KG;
    return {
      weight: ws.length ? ws[ws.length - 1] : null,
      weightChange: ws.length > 1 ? ws[ws.length - 1] - ws[0] : null,
      weighIns: ws.length,
      sleep: avg(sleep),
      nights: sleep.length,
      eaten: avg(eaten),
      protein: avg(protein),
      burn: avg(burn),
      workoutAvg: avg(workouts),
      workoutDays: workouts.length,
      balance: avgBal,
      perWeek: perWeekKg == null ? null : unit === "kg" ? perWeekKg : convert(perWeekKg, "kg", "lb"),
    };
  }, [days, unit]);

  // ---------- chart data (weekly averages for long ranges) ----------
  const weekly = range > 90;
  const chart = useMemo(() => {
    type Pick = (d: DaySummary) => number | null;
    const bucketed = (pick: Pick) => {
      if (!weekly) return days.map(pick);
      const out: (number | null)[] = [];
      for (let i = 0; i < days.length; i += 7) out.push(avg(days.slice(i, i + 7).flatMap((d) => (pick(d) != null ? [pick(d)!] : []))));
      return out;
    };
    const dates = weekly ? days.filter((_, i) => i % 7 === 0).map((d) => d.date) : days.map((d) => d.date);

    const weightDaily = days.map((d) => (d.weightKg != null ? convert(d.weightKg, "kg", unit) : null));
    // 7-day rolling average of weigh-ins
    const trend = weightDaily.map((_, i) => avg(weightDaily.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v != null)));

    return {
      dates,
      weight: weekly ? bucketed((d) => (d.weightKg != null ? convert(d.weightKg, "kg", unit) : null)) : weightDaily,
      weightTrend: weekly ? null : trend,
      sleep: bucketed((d) => (d.sleepMin != null ? d.sleepMin / 60 : null)),
      eaten: bucketed((d) => d.intake),
      burn: bucketed((d) => totalBurn(d)),
      balance: bucketed((d) => d.balance),
      workout: bucketed((d) => (d.exerciseKcal >= 1 ? d.exerciseKcal : null)),
    };
  }, [days, unit, weekly]);

  const weightSeries: Series[] = chart.weightTrend
    ? [
        { name: "Weigh-in", color: BLUE, values: chart.weight, kind: "dots" },
        { name: "7-day average", color: BLUE, values: chart.weightTrend, kind: "line", connectGaps: true },
      ]
    : [{ name: "Weekly average", color: BLUE, values: chart.weight, kind: "line", connectGaps: true }];

  const kcal = (v: number) => Math.round(v).toLocaleString();
  const per = weekly ? " (weekly averages)" : "";

  return (
    <main className="mx-auto max-w-3xl px-3 pb-10 pt-4 sm:px-6">
      <AppNav current="dashboard" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-zinc-300 bg-white text-xs">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => pickRange(r.days)}
                className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${range === r.days ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>
      </div>

      {error && <p className="mb-3 rounded bg-red-100 p-2 text-sm text-red-700">{error}</p>}
      {!hasProfile && !loading && (
        <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
          Fill in your{" "}
          <Link href="/profile" className="font-medium underline">
            profile
          </Link>{" "}
          to see total calories burned{MEALS_ENABLED ? " and your surplus or deficit" : ""}.
        </p>
      )}

      <div className={loading ? "opacity-60" : ""}>
        {/* headline tiles */}
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile
            label={`Weight (${unit})`}
            value={tiles.weight == null ? "–" : tiles.weight.toFixed(1)}
            sub={tiles.weightChange == null ? `${tiles.weighIns} weigh-ins` : `${signed(tiles.weightChange, 1)} ${unit} this period`}
          />
          <Tile label="Avg sleep" value={tiles.sleep == null ? "–" : formatDuration(tiles.sleep)} sub={`${tiles.nights} nights logged`} />
          {MEALS_ENABLED && <Tile
            label="Avg eaten / day"
            value={tiles.eaten == null ? "–" : `${kcal(tiles.eaten)} kcal`}
            sub={tiles.protein == null ? "no meals logged" : `${Math.round(tiles.protein)} g protein`}
          />}
          <Tile
            label="Avg burned / day"
            value={tiles.burn == null ? "–" : `${kcal(tiles.burn)} kcal`}
            sub={tiles.workoutAvg == null ? "no workouts logged" : `workouts ≈ ${kcal(tiles.workoutAvg)} on ${tiles.workoutDays} days`}
          />
          {MEALS_ENABLED && <Tile
            label={tiles.balance == null ? "Avg balance" : tiles.balance > 0 ? "Avg surplus" : "Avg deficit"}
            value={tiles.balance == null ? "–" : `${signed(Math.round(tiles.balance))} kcal`}
            sub={tiles.perWeek == null ? "needs meals + profile" : `≈ ${signed(tiles.perWeek, 2)} ${unit} / week`}
          />}
        </section>

        <ChartCard title={`Weight (${unit})${per}`}>
          <TimeChart dates={chart.dates} series={weightSeries} format={(v) => v.toFixed(1)} />
        </ChartCard>

        <ChartCard title={`Sleep (hours)${per}`}>
          <TimeChart
            dates={chart.dates}
            series={[{ name: "Sleep", color: BLUE, values: chart.sleep, kind: "bar" }]}
            format={(v) => formatDuration(v * 60)}
            refLine={tiles.sleep != null ? { value: tiles.sleep / 60, label: `avg ${formatDuration(tiles.sleep)}` } : undefined}
          />
        </ChartCard>

        <ChartCard title={`${MEALS_ENABLED ? "Calories eaten vs burned" : "Calories burned"} (kcal)${per}`}>
          <TimeChart
            dates={chart.dates}
            series={[
              ...(MEALS_ENABLED ? [{ name: "Eaten", color: BLUE, values: chart.eaten, kind: "line" as const, connectGaps: false }] : []),
              { name: "Burned", color: ORANGE, values: chart.burn, kind: "line" },
            ]}
            format={kcal}
            zeroBased
          />
          {!hasProfile && <p className="mt-1 text-xs text-zinc-500">Burned needs your profile.</p>}
        </ChartCard>

        {MEALS_ENABLED && <ChartCard title={`Daily balance (kcal)${per}`} note="Below zero = deficit, above = surplus">
          <TimeChart
            dates={chart.dates}
            series={[{ name: "Balance", color: BLUE, values: chart.balance, kind: "bar" }]}
            format={(v) => signed(Math.round(v))}
            diverging={[BLUE, RED]}
          />
        </ChartCard>}

        <ChartCard title={`Calories burned by workouts (kcal)${per}`}>
          <TimeChart dates={chart.dates} series={[{ name: "Workouts", color: ORANGE, values: chart.workout, kind: "bar" }]} format={kcal} />
        </ChartCard>

        {/* table view */}
        <details className="rounded-xl border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-3 py-3 text-sm font-medium">Show data table</summary>
          <div className="max-h-96 overflow-auto border-t border-zinc-100">
            <table className="w-full text-right text-xs tabular-nums">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Weight</th>
                  <th className="px-2 py-1.5 font-medium">Sleep</th>
                  {MEALS_ENABLED && <th className="px-2 py-1.5 font-medium">Eaten</th>}
                  <th className="px-2 py-1.5 font-medium">Burned</th>
                  {MEALS_ENABLED && <th className="px-2 py-1.5 font-medium">Balance</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {[...days].reverse().map((d) => {
                  const b = totalBurn(d);
                  return (
                    <tr key={d.date}>
                      <td className="px-2 py-1.5 text-left">
                        <Link href={`/day/${d.date}`} className="hover:underline">
                          {parseISODate(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">{d.weightKg == null ? "–" : convert(d.weightKg, "kg", unit).toFixed(1)}</td>
                      <td className="px-2 py-1.5">{d.sleepMin == null ? "–" : formatDuration(d.sleepMin)}</td>
                      {MEALS_ENABLED && <td className="px-2 py-1.5">{d.intake == null ? "–" : kcal(d.intake)}</td>}
                      <td className="px-2 py-1.5">{b == null ? (d.exerciseKcal >= 1 ? `+${kcal(d.exerciseKcal)}` : "–") : kcal(b)}</td>
                      {MEALS_ENABLED && <td className="px-2 py-1.5">{d.balance == null ? "–" : signed(Math.round(d.balance))}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-zinc-500">{sub}</div>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="text-xs text-zinc-500">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}
