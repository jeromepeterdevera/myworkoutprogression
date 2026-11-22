"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Food, toFood } from "./nutrition";
import type { UsdaFood } from "@/app/api/foods/search/route";

export type { UsdaFood };

/** Search USDA FoodData Central (through our server route). Values are per 100 g. */
export async function searchUsda(q: string): Promise<{ foods: UsdaFood[]; error: string | null }> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { foods: [], error: "Not signed in" };
  try {
    const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok) return { foods: [], error: body.error ?? "Search failed" };
    return { foods: body.foods ?? [], error: null };
  } catch {
    return { foods: [], error: "Search failed, check your connection" };
  }
}

const cache = new Map<string, UsdaFood[]>();

/** Debounced search while the user types. */
export function useUsdaSearch(q: string) {
  const term = q.trim().toLowerCase();
  const [state, setState] = useState<{ term: string; foods: UsdaFood[]; error: string | null; loading: boolean }>({
    term: "",
    foods: [],
    error: null,
    loading: false,
  });

  useEffect(() => {
    if (term.length < 2) {
      setState({ term, foods: [], error: null, loading: false });
      return;
    }
    const hit = cache.get(term);
    if (hit) {
      setState({ term, foods: hit, error: null, loading: false });
      return;
    }
    setState((s) => ({ ...s, term, loading: true, error: null }));
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchUsda(term);
      if (!r.error) cache.set(term, r.foods);
      if (live) setState({ term, foods: r.foods, error: r.error, loading: false });
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);

  return state;
}

/**
 * Put a USDA food into the user's library (per 100 g) so it can be logged and reused without another lookup.
 * If a food with the same name already exists, its values are replaced with USDA's.
 */
export async function saveUsdaFood(u: UsdaFood, existing?: Food): Promise<{ food: Food | null; error: string | null }> {
  const row = { name: existing?.name ?? u.name, base_amount: 100, base_unit: "g", calories: u.calories, protein: u.protein, carbs: u.carbs, fat: u.fat };
  const foods = supabase().from("foods");
  if (existing) {
    const { data, error } = await foods.update(row).eq("id", existing.id).select().single();
    return error ? { food: null, error: error.message } : { food: toFood(data), error: null };
  }
  const ins = await foods.insert(row).select().single();
  if (!ins.error) return { food: toFood(ins.data), error: null };
  if (ins.error.code !== "23505") return { food: null, error: ins.error.message };
  // already in the library under that name: refresh its values
  const escaped = u.name.replace(/[%_\\]/g, (c) => "\\" + c);
  const { data, error } = await foods.update(row).ilike("name", escaped).select().single();
  return error ? { food: null, error: error.message } : { food: toFood(data), error: null };
}
