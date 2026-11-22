"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import NumInput from "./NumInput";
import FoodForm from "./FoodForm";
import { newKey, parseISODate } from "@/lib/workout";
import { Food, MEALS, Macros, Meal, MealEntry, fmt1, foodBaseLabel, foodKcal, macrosFor, sumEntries } from "@/lib/nutrition";
import UsdaResults from "./UsdaResults";
import { UsdaFood, saveUsdaFood } from "@/lib/usda";

export default function MealsTab({
  foods,
  items,
  previousDate,
  onChange,
  onFoodSaved,
  onCopyPrevious,
  burn,
}: {
  foods: Food[];
  items: MealEntry[];
  previousDate: string | null;
  onChange: (items: MealEntry[]) => void;
  onFoodSaved: (food: Food) => void;
  onCopyPrevious: () => void;
  /** estimated calories burned today: baseline (null without a profile) and workouts */
  burn: { baseline: number | null; exercise: number };
}) {
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // food id
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const total = sumEntries(items, foodMap);

  const addItem = (meal: Meal, food: Food, quantity: number) => {
    onChange([...items, { key: newKey(), meal, foodId: food.id, quantity }]);
    setAdding(null);
  };
  const update = (key: string, patch: Partial<MealEntry>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));

  return (
    <div>
      <MacroSummary m={total} big />
      <BalanceCard intake={total.kcal} burn={burn} hasItems={items.length > 0} />

      {items.length === 0 && previousDate && (
        <button
          type="button"
          onClick={onCopyPrevious}
          className="mb-4 w-full rounded-lg border border-dashed border-zinc-300 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          Copy meals from {parseISODate(previousDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </button>
      )}

      <div className="space-y-4">
        {MEALS.map((m) => {
          const mealItems = items.filter((i) => i.meal === m.value);
          const mt = sumEntries(mealItems, foodMap);
          return (
            <section key={m.value} className="rounded-xl border border-zinc-200 bg-white">
              <div className="flex items-baseline justify-between px-3 pt-3">
                <h3 className="font-semibold">{m.label}</h3>
                {mealItems.length > 0 && (
                  <span className="text-xs text-zinc-500">
                    <span className="font-semibold text-zinc-800">{Math.round(mt.kcal)} kcal</span> · P {fmt1(mt.protein)} · C {fmt1(mt.carbs)} · F{" "}
                    {fmt1(mt.fat)}
                  </span>
                )}
              </div>

              <ul className="divide-y divide-zinc-100 px-3">
                {mealItems.map((it) => {
                  const food = foodMap.get(it.foodId);
                  const mm = macrosFor(food, it.quantity);
                  return (
                    <li key={it.key} className="py-2">
                      {editing === it.foodId && food ? (
                        <FoodForm
                          initial={food}
                          onSaved={(f) => {
                            onFoodSaved(f);
                            setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => setEditing(it.foodId)}
                              className="block max-w-full truncate text-left font-medium hover:underline"
                              title="Edit this food's nutrition"
                            >
                              {food?.name ?? "Unknown food"}
                            </button>
                            {food && foodKcal(food) === 0 ? (
                              <button type="button" onClick={() => setEditing(it.foodId)} className="block text-left text-xs font-medium text-amber-700 hover:underline">
                                No nutrition values. Tap to add them
                              </button>
                            ) : (
                              <span className="block text-xs text-zinc-500">
                                {Math.round(mm.kcal)} kcal · P {fmt1(mm.protein)} · C {fmt1(mm.carbs)} · F {fmt1(mm.fat)}
                              </span>
                            )}
                          </div>
                          <div className="w-20 shrink-0">
                            <NumInput value={it.quantity} onChange={(q) => update(it.key, { quantity: q })} decimal ariaLabel="Amount" />
                          </div>
                          <span className="w-12 shrink-0 truncate text-xs text-zinc-500">{food?.base_unit}</span>
                          <button
                            type="button"
                            onClick={() => remove(it.key)}
                            className="shrink-0 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="px-3 pb-3 pt-1">
                {adding === m.value ? (
                  <FoodAdder foods={foods} onAdd={(f, q) => addItem(m.value, f, q)} onFoodSaved={onFoodSaved} onClose={() => setAdding(null)} />
                ) : (
                  <button type="button" onClick={() => setAdding(m.value)} className="text-sm font-medium text-zinc-700 hover:underline">
                    + Add food
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-zinc-400">Tap a food&apos;s name to change its nutrition values.</p>
    </div>
  );
}

function FoodAdder({
  foods,
  onAdd,
  onFoodSaved,
  onClose,
}: {
  foods: Food[];
  onAdd: (f: Food, quantity: number) => void;
  onFoodSaved: (f: Food) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Food | null>(null);
  const onPick = (f: Food) => setChosen(f);
  const onCreated = (f: Food) => {
    onFoodSaved(f);
    setChosen(f);
  };
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? foods.filter((f) => f.name.toLowerCase().includes(s)) : foods;
    return list.slice(0, s ? 8 : 50);
  }, [foods, q]);
  const mine = useMemo(() => new Set(foods.map((f) => f.name.toLowerCase())), [foods]);

  const pickUsda = async (u: UsdaFood) => {
    setBusyId(u.fdcId);
    setError(null);
    const { food, error } = await saveUsdaFood(u);
    setBusyId(null);
    if (error || !food) setError(error ?? "Couldn't add that food");
    else onCreated(food);
  };

  if (chosen) return <AmountStep food={chosen} onAdd={(q) => onAdd(chosen, q)} onBack={() => setChosen(null)} />;
  if (creating) return <FoodForm initialName={q.trim()} onSaved={onCreated} onCancel={() => setCreating(false)} />;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What did you eat? e.g. scrambled egg"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-base outline-none focus:border-zinc-900"
        />
        <button type="button" onClick={onClose} className="rounded-md px-2 text-sm text-zinc-600 hover:bg-zinc-200">
          Cancel
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {matches.length > 0 && (
          <>
            {q.trim() && <div className="mt-2 px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Your foods</div>}
            <ul className="divide-y divide-zinc-100">
              {matches.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => onPick(f)} className="flex w-full items-baseline justify-between gap-2 px-1 py-2 text-left hover:bg-white">
                    <span className="truncate font-medium">{f.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {Math.round(foodKcal(f))} kcal / {foodBaseLabel(f)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <UsdaResults q={q} onPick={pickUsda} busyId={busyId} hide={mine} />
      </div>
      {error && <p className="mt-1 px-1 text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => setCreating(true)} className="mt-2 w-full rounded-md border border-zinc-300 bg-white py-2 text-sm text-zinc-700 hover:bg-zinc-100">
        Not listed? Enter it from the label
      </button>
    </div>
  );
}

/** After picking a food: how much did you eat? Macros preview live as you type. */
function AmountStep({ food, onAdd, onBack }: { food: Food; onAdd: (quantity: number) => void; onBack: () => void }) {
  const perPiece = food.base_unit !== "g" && food.base_unit !== "ml";
  const [qty, setQty] = useState<number | null>(perPiece ? food.base_amount : null);
  const m = macrosFor(food, qty);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qty && qty > 0) onAdd(qty);
  };
  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="font-medium">{food.name}</div>
      <label className="mt-2 block text-sm text-zinc-600" htmlFor="amount-eaten">
        How much did you eat?
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id="amount-eaten"
          autoFocus
          type="text"
          inputMode="decimal"
          value={qty ?? ""}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".");
            if (!/^\d*\.?\d*$/.test(raw)) return;
            setQty(raw === "" || raw === "." ? null : Number(raw));
          }}
          placeholder="e.g. 150"
          className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-2 text-center text-base outline-none focus:border-zinc-900"
        />
        <span className="text-sm text-zinc-500">{food.base_unit}</span>
        <button type="submit" disabled={!qty} className="ml-auto rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-30">
          Add
        </button>
      </div>
      <div className="mt-2 text-xs text-zinc-500">
        {qty ? (
          <>
            <span className="font-semibold text-zinc-800">{Math.round(m.kcal)} kcal</span> · P {fmt1(m.protein)} · C {fmt1(m.carbs)} · F {fmt1(m.fat)}
          </>
        ) : (
          <>Weigh it if you can; macros are worked out from this amount.</>
        )}
      </div>
      <button type="button" onClick={onBack} className="mt-2 text-sm text-zinc-600 hover:underline">
        ← Pick a different food
      </button>
    </form>
  );
}

export function MacroSummary({ m, big }: { m: Macros; big?: boolean }) {
  const pc = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  const pct = (v: number) => (pc ? Math.round((v / pc) * 100) : 0);
  return (
    <div className={big ? "mb-4" : ""}>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Box label="kcal" value={String(Math.round(m.kcal))} />
        <Box label={`Protein g${pc ? ` · ${pct(m.protein * 4)}%` : ""}`} value={fmt1(m.protein)} />
        <Box label={`Carbs g${pc ? ` · ${pct(m.carbs * 4)}%` : ""}`} value={fmt1(m.carbs)} />
        <Box label={`Fat g${pc ? ` · ${pct(m.fat * 9)}%` : ""}`} value={fmt1(m.fat)} />
      </div>
      {pc > 0 && (
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-200">
          <div className="bg-rose-500" style={{ width: `${pct(m.protein * 4)}%` }} />
          <div className="bg-amber-500" style={{ width: `${pct(m.carbs * 4)}%` }} />
          <div className="bg-sky-500" style={{ width: `${pct(m.fat * 9)}%` }} />
        </div>
      )}
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-1 py-2">
      <div className="text-base font-semibold sm:text-lg">{value}</div>
      <div className="text-[10px] text-zinc-500 sm:text-[11px]">{label}</div>
    </div>
  );
}

function BalanceCard({
  intake,
  burn,
  hasItems,
}: {
  intake: number;
  burn: { baseline: number | null; exercise: number };
  hasItems: boolean;
}) {
  if (burn.baseline == null) {
    return (
      <p className="mb-4 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
        To see your calorie surplus or deficit, fill in your{" "}
        <Link href="/profile" className="font-medium underline">
          profile
        </Link>{" "}
        (sex, birth year, height).
      </p>
    );
  }
  const out = burn.baseline + burn.exercise;
  const balance = intake - out;
  return (
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">Calorie balance</span>
        {hasItems ? (
          <span className={`text-lg font-semibold ${balance > 0 ? "text-red-600" : "text-blue-600"}`}>
            {balance > 0 ? "+" : "−"}
            {Math.abs(Math.round(balance))} kcal {balance > 0 ? "surplus" : "deficit"}
          </span>
        ) : (
          <span className="text-zinc-400">log meals to see it</span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">
        Eaten {Math.round(intake)} − burned ≈ {Math.round(out)} (body {Math.round(burn.baseline)} + workouts {Math.round(burn.exercise)})
      </div>
    </div>
  );
}
