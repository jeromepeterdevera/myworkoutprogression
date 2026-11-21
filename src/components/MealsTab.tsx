"use client";

import { useMemo, useState } from "react";
import NumInput from "./NumInput";
import FoodForm from "./FoodForm";
import { newKey, parseISODate } from "@/lib/workout";
import { Food, MEALS, Macros, Meal, MealEntry, fmt1, foodBaseLabel, foodKcal, macrosFor, sumEntries } from "@/lib/nutrition";

export default function MealsTab({
  foods,
  items,
  previousDate,
  onChange,
  onFoodSaved,
  onCopyPrevious,
}: {
  foods: Food[];
  items: MealEntry[];
  previousDate: string | null;
  onChange: (items: MealEntry[]) => void;
  onFoodSaved: (food: Food) => void;
  onCopyPrevious: () => void;
}) {
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // food id
  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const total = sumEntries(items, foodMap);

  const addItem = (meal: Meal, food: Food) => {
    onChange([...items, { key: newKey(), meal, foodId: food.id, quantity: food.base_amount }]);
    setAdding(null);
  };
  const update = (key: string, patch: Partial<MealEntry>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));

  return (
    <div>
      <MacroSummary m={total} big />

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
                            <span className="block text-xs text-zinc-500">
                              {Math.round(mm.kcal)} kcal · P {fmt1(mm.protein)} · C {fmt1(mm.carbs)} · F {fmt1(mm.fat)}
                            </span>
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
                  <FoodAdder foods={foods} onPick={(f) => addItem(m.value, f)} onCreated={(f) => { onFoodSaved(f); addItem(m.value, f); }} onClose={() => setAdding(null)} />
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
      <p className="mt-3 text-center text-xs text-zinc-400">Tap a food&apos;s name to edit its nutrition values.</p>
    </div>
  );
}

function FoodAdder({
  foods,
  onPick,
  onCreated,
  onClose,
}: {
  foods: Food[];
  onPick: (f: Food) => void;
  onCreated: (f: Food) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? foods.filter((f) => f.name.toLowerCase().includes(s)) : foods;
    return list.slice(0, 50);
  }, [foods, q]);
  const exact = foods.some((f) => f.name.toLowerCase() === q.trim().toLowerCase());

  if (creating) return <FoodForm initialName={q.trim()} onSaved={onCreated} onCancel={() => setCreating(false)} />;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={foods.length ? "Search your foods…" : "Type a food name…"}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-base outline-none focus:border-zinc-900"
        />
        <button type="button" onClick={onClose} className="rounded-md px-2 text-sm text-zinc-600 hover:bg-zinc-200">
          Cancel
        </button>
      </div>
      <ul className="mt-1 max-h-64 divide-y divide-zinc-100 overflow-y-auto">
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
      {!exact && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-1 w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white"
        >
          {q.trim() ? `Create “${q.trim()}”` : "Create a new food"}
        </button>
      )}
    </div>
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
