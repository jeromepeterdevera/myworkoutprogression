"use client";

import { useEffect, useState } from "react";
import type { Unit } from "./workout";

const KEY = "display-unit";

/** Unit used for calendar/day totals (each exercise keeps its own unit). */
export function useDisplayUnit(): [Unit, (u: Unit) => void] {
  const [unit, setUnit] = useState<Unit>("kg");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "kg" || v === "lb") setUnit(v);
    } catch {}
  }, []);
  const update = (u: Unit) => {
    setUnit(u);
    try {
      localStorage.setItem(KEY, u);
    } catch {}
  };
  return [unit, update];
}
