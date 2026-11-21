export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export const MEALS: { value: Meal; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
];

/** A food in your personal library. Macros are for `base_amount` of `base_unit` (e.g. 100 g, 1 egg). */
export interface Food {
  id: string;
  name: string;
  base_amount: number;
  base_unit: string;
  calories: number | null; // null = work it out from the macros
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealEntry {
  key: string; // client-side id
  meal: Meal;
  foodId: string;
  quantity: number | null;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function foodKcal(f: Pick<Food, "calories" | "protein" | "carbs" | "fat">) {
  return f.calories ?? f.protein * 4 + f.carbs * 4 + f.fat * 9;
}

export function macrosFor(food: Food | undefined, quantity: number | null): Macros {
  if (!food || !quantity || !food.base_amount) return ZERO;
  const k = quantity / food.base_amount;
  return { kcal: foodKcal(food) * k, protein: food.protein * k, carbs: food.carbs * k, fat: food.fat * k };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function sumEntries(entries: { foodId: string; quantity: number | null }[], foods: Map<string, Food>) {
  return entries.reduce((t, e) => addMacros(t, macrosFor(foods.get(e.foodId), e.quantity)), ZERO);
}

/** "12", "12.5" — at most one decimal, no trailing .0 */
export function fmt1(n: number) {
  return String(Math.round(n * 10) / 10);
}

export function foodBaseLabel(f: Pick<Food, "base_amount" | "base_unit">) {
  return `${fmt1(f.base_amount)} ${f.base_unit}`;
}

export const BASE_UNITS = ["g", "ml", "piece", "serving", "scoop", "cup", "tbsp", "tsp", "slice"];

/** Database row -> Food (numeric columns can arrive as strings) */
export function toFood(r: Record<string, unknown>): Food {
  return {
    id: String(r.id),
    name: String(r.name),
    base_amount: Number(r.base_amount),
    base_unit: String(r.base_unit),
    calories: r.calories == null ? null : Number(r.calories),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
  };
}
