import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Food search through USDA FoodData Central. Runs on the server so the API key (FDC_API_KEY)
 * never reaches the browser, and only answers signed-in users so nobody else can use up the quota.
 * Every value returned is per 100 g.
 */

const FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
// generic foods; "Branded" is left out because it's mostly packaged US products
const DATA_TYPES = "Foundation,SR Legacy,Survey (FNDDS)";

const ENERGY = [1008, 2047, 2048]; // kcal; Foundation foods sometimes only have the Atwater ones
const PROTEIN = [1003];
const FAT = [1004];
const CARBS = [1005, 1050];

interface FdcNutrient {
  nutrientId: number;
  unitName?: string;
  value?: number;
}
interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodCategory?: string;
  foodNutrients?: FdcNutrient[];
}

export interface UsdaFood {
  fdcId: number;
  name: string;
  category: string | null;
  calories: number | null;
  protein: number;
  carbs: number;
  fat: number;
}

function pick(ns: FdcNutrient[], ids: number[], unit?: string) {
  for (const id of ids) {
    const n = ns.find((x) => x.nutrientId === id && (!unit || x.unitName?.toUpperCase() === unit));
    if (n?.value != null) return n.value;
  }
  return null;
}

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ foods: [] });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: user, error: authError } = await createClient(url, anon).auth.getUser(token);
  if (authError || !user.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // DEMO_KEY works for trying things out locally but is heavily rate-limited
  const key = process.env.FDC_API_KEY || "DEMO_KEY";
  const params = new URLSearchParams({ api_key: key, query: q, dataType: DATA_TYPES, pageSize: "25" });
  let res: Response;
  try {
    res = await fetch(`${FDC_URL}?${params}`, { next: { revalidate: 60 * 60 * 24 } });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the USDA food database" }, { status: 502 });
  }
  if (!res.ok) {
    const msg = res.status === 429 ? "USDA rate limit reached, try again in a bit" : `USDA search failed (${res.status})`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const body = (await res.json()) as { foods?: FdcFood[] };

  const foods: UsdaFood[] = (body.foods ?? [])
    .map((f) => {
      const ns = f.foodNutrients ?? [];
      return {
        fdcId: f.fdcId,
        name: f.description,
        category: f.foodCategory ?? null,
        calories: round1(pick(ns, ENERGY, "KCAL")),
        protein: round1(pick(ns, PROTEIN)) ?? 0,
        carbs: round1(pick(ns, CARBS)) ?? 0,
        fat: round1(pick(ns, FAT)) ?? 0,
      };
    })
    .filter((f) => f.calories || f.protein || f.carbs || f.fat);

  return NextResponse.json({ foods });
}
