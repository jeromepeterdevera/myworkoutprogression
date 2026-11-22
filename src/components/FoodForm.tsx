"use client";

import { useId, useState } from "react";
import NumInput from "./NumInput";
import { supabase } from "@/lib/supabase";
import UsdaResults from "./UsdaResults";
import { BASE_UNITS, Food, fmt1, toFood } from "@/lib/nutrition";
import { UsdaFood, saveUsdaFood } from "@/lib/usda";

/** Create a new food (from its label) or edit an existing one. Saves straight to the database. */
export default function FoodForm({
  initial,
  initialName,
  onSaved,
  onCancel,
}: {
  initial?: Food;
  initialName?: string;
  onSaved: (food: Food) => void;
  onCancel: () => void;
}) {
  const start = initial;
  // a 0 from an empty save reads better as an empty box
  const nz = (v: number | null | undefined) => (v ? v : null);
  const [name, setName] = useState(start?.name ?? initialName ?? "");
  const [baseAmount, setBaseAmount] = useState<number | null>(start?.base_amount ?? 100);
  const [baseUnit, setBaseUnit] = useState(start?.base_unit ?? "g");
  const [calories, setCalories] = useState<number | null>(nz(start?.calories));
  const [protein, setProtein] = useState<number | null>(nz(start?.protein));
  const [carbs, setCarbs] = useState<number | null>(nz(start?.carbs));
  const [fat, setFat] = useState<number | null>(nz(start?.fat));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unitList = useId();

  const autoKcal = (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9;
  const hasNutrition = !!(calories || protein || carbs || fat);
  const canSave = name.trim() && baseAmount && baseAmount > 0 && baseUnit.trim() && hasNutrition;
  const [busyId, setBusyId] = useState<number | null>(null);

  // take the values straight from USDA (per 100 g) and save
  const pickUsda = async (u: UsdaFood) => {
    setBusyId(u.fdcId);
    setError(null);
    const { food, error } = await saveUsdaFood(u, initial);
    setBusyId(null);
    if (error || !food) setError(error ?? "Couldn't save that food");
    else onSaved(food);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasNutrition) {
      setError("Enter the calories or at least one macro, otherwise this food will count as 0.");
      return;
    }
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const row = {
      name: name.trim(),
      base_amount: baseAmount,
      base_unit: baseUnit.trim(),
      calories,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0,
    };
    const sb = supabase().from("foods");
    const { data, error } = initial
      ? await sb.update(row).eq("id", initial.id).select().single()
      : await sb.insert(row).select().single();
    setSaving(false);
    if (error) {
      setError(error.code === "23505" ? "You already have a food with that name." : error.message);
      return;
    }
    onSaved(toFood(data));
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {initial ? "Edit food" : "New food"}{" "}
        <span className="normal-case tracking-normal text-zinc-400">
          · {hasNutrition ? "copy the numbers from the label" : "pick a USDA match or copy the numbers from the label"}
        </span>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Food name, e.g. Chicken breast (cooked)"
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-base outline-none focus:border-zinc-900"
      />
      {!hasNutrition && name.trim().length >= 2 && (
        <div className="rounded-md border border-zinc-200 bg-white px-2 pb-1">
          <UsdaResults q={name} onPick={pickUsda} busyId={busyId} limit={5} />
        </div>
      )}
      <div>
        <span className="mb-1 block text-xs text-zinc-500">Nutrition values are per</span>
        <div className="flex gap-2">
          <div className="w-24">
            <NumInput value={baseAmount} onChange={setBaseAmount} decimal ariaLabel="Amount" />
          </div>
          <input
            list={unitList}
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value)}
            placeholder="g, ml, piece…"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-base outline-none focus:border-zinc-900"
          />
          <datalist id={unitList}>
            {BASE_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Field label="Protein g">
          <NumInput value={protein} onChange={setProtein} decimal ariaLabel="Protein" />
        </Field>
        <Field label="Carbs g">
          <NumInput value={carbs} onChange={setCarbs} decimal ariaLabel="Carbs" />
        </Field>
        <Field label="Fat g">
          <NumInput value={fat} onChange={setFat} decimal ariaLabel="Fat" />
        </Field>
        <Field label="kcal">
          <NumInput value={calories} onChange={setCalories} decimal placeholder={fmt1(autoKcal)} ariaLabel="Calories" />
        </Field>
      </div>
      <p className="text-[11px] text-zinc-500">Leave kcal empty to calculate it from the macros (4 / 4 / 9 kcal per gram).</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-200">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-30">
          {saving ? "Saving…" : initial ? "Save food" : "Create & add"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
