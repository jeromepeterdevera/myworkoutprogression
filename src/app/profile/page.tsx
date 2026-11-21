"use client";

import { useEffect, useState } from "react";
import AppNav from "@/components/AppNav";
import NumInput from "@/components/NumInput";
import UnitToggle from "@/components/UnitToggle";
import { supabase } from "@/lib/supabase";
import { useDisplayUnit } from "@/lib/useDisplayUnit";
import { loadProfile } from "@/lib/daily";
import { ACTIVITY_LEVELS, FALLBACK_KG, baselineKcal } from "@/lib/activity";
import { toISODate } from "@/lib/workout";

const CM_PER_IN = 2.54;

export default function ProfilePage() {
  const [unit, setUnit] = useDisplayUnit();
  const [sex, setSex] = useState<"male" | "female" | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [activity, setActivity] = useState(1.2);
  const [latestKg, setLatestKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [{ profile, error }, w] = await Promise.all([
        loadProfile(),
        supabase()
          .from("daily_logs")
          .select("weight_kg")
          .not("weight_kg", "is", null)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (error) setMessage({ kind: "err", text: error });
      if (profile) {
        setSex(profile.sex);
        setBirthYear(profile.birth_year);
        setHeightCm(profile.height_cm);
        setActivity(profile.activity_factor);
      }
      setLatestKg(w.data?.weight_kg != null ? Number(w.data.weight_kg) : null);
      setLoading(false);
    })();
  }, []);

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setMessage(null);
  };

  // feet / inches view of height
  const totalIn = heightCm == null ? null : heightCm / CM_PER_IN;
  const ft = totalIn == null ? null : Math.floor(Math.round(totalIn) / 12);
  const inch = totalIn == null ? null : Math.round(totalIn) % 12;
  const setFtIn = (f: number | null, i: number | null) => {
    const t = (f ?? 0) * 12 + (i ?? 0);
    edit(setHeightCm)(t > 0 ? Math.round(t * CM_PER_IN * 10) / 10 : null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const sb = supabase();
    const { data: auth } = await sb.auth.getSession();
    const { error } = await sb.from("profiles").upsert(
      {
        user_id: auth.session?.user.id,
        sex,
        birth_year: birthYear,
        height_cm: heightCm,
        activity_factor: activity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setMessage(error ? { kind: "err", text: error.message } : { kind: "ok", text: "Profile saved" });
  };

  const kg = latestKg ?? FALLBACK_KG;
  const preview = baselineKcal({ sex, birth_year: birthYear, height_cm: heightCm, activity_factor: activity }, kg, toISODate(new Date()));

  if (loading) return <div className="flex min-h-dvh items-center justify-center text-zinc-400">Loading…</div>;

  return (
    <main className="mx-auto max-w-xl px-3 pb-10 pt-4 sm:px-6">
      <AppNav current="profile" />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Profile</h1>
        <UnitToggle unit={unit} onChange={setUnit} />
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        Used to estimate how many calories your body burns each day, so the app can show a calorie surplus or deficit. Your weight comes from your
        daily weigh-ins.
      </p>

      <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4">
        <Field label="Sex">
          <div className="flex w-fit rounded-md border border-zinc-300 bg-white text-sm">
            {(["male", "female"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => edit(setSex)(s)}
                className={`px-4 py-2 capitalize first:rounded-l-md last:rounded-r-md ${sex === s ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Birth year">
          <div className="w-28">
            <NumInput value={birthYear} onChange={edit(setBirthYear)} placeholder="e.g. 1992" ariaLabel="Birth year" />
          </div>
        </Field>

        <Field label="Height">
          {unit === "kg" ? (
            <div className="flex items-center gap-2">
              <div className="w-28">
                <NumInput value={heightCm} onChange={edit(setHeightCm)} decimal ariaLabel="Height in cm" />
              </div>
              <span className="text-sm text-zinc-500">cm</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-20">
                <NumInput value={ft} onChange={(v) => setFtIn(v, inch)} ariaLabel="Feet" />
              </div>
              <span className="text-sm text-zinc-500">ft</span>
              <div className="w-20">
                <NumInput value={inch} onChange={(v) => setFtIn(ft, v)} ariaLabel="Inches" />
              </div>
              <span className="text-sm text-zinc-500">in</span>
            </div>
          )}
        </Field>

        <Field label="Activity outside of workouts">
          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIVITY_LEVELS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => edit(setActivity)(a.value)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  activity === a.value ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="block text-sm font-medium">{a.label}</span>
                <span className={`block text-xs ${activity === a.value ? "text-zinc-300" : "text-zinc-500"}`}>{a.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Don&apos;t count your workouts here. They&apos;re added on top from what you log each day.</p>
        </Field>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
        {preview != null ? (
          <>
            Your body burns about <b>{Math.round(preview).toLocaleString()} kcal</b> a day before workouts
            <span className="text-zinc-500">
              {" "}
              (at {(unit === "kg" ? kg : kg / 0.45359237).toFixed(1)} {unit}
              {latestKg == null ? ", a placeholder until you log your weight" : ""}).
            </span>
          </>
        ) : (
          <span className="text-zinc-500">Fill in sex, birth year and height to see your daily burn.</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {message && <span className={`text-sm ${message.kind === "err" ? "text-red-600" : "text-zinc-500"}`}>{message.text}</span>}
        <button onClick={save} disabled={saving} className="rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}
