// Calorie-burn estimates.
// Exercise uses METs from the Compendium of Physical Activities: kcal = (MET − 1) × kg × hours.
// We subtract 1 MET (resting) because resting burn is already counted in the daily baseline below.
// Baseline (what you burn without workouts) = Mifflin–St Jeor BMR × activity factor.

export type Intensity = "light" | "moderate" | "vigorous";
export const INTENSITIES: { value: Intensity; label: string; factor: number }[] = [
  { value: "light", label: "Light", factor: 0.75 },
  { value: "moderate", label: "Moderate", factor: 1 },
  { value: "vigorous", label: "Vigorous", factor: 1.25 },
];

export const SPORTS: { name: string; met: number }[] = [
  { name: "Badminton", met: 5.5 },
  { name: "Baseball", met: 5 },
  { name: "Basketball", met: 6.5 },
  { name: "Boxing", met: 7.8 },
  { name: "Climbing", met: 7 },
  { name: "Cycling", met: 7.5 },
  { name: "Dancing", met: 5 },
  { name: "Football (soccer)", met: 7 },
  { name: "Golf", met: 4.8 },
  { name: "Hiking", met: 6 },
  { name: "Hockey", met: 8 },
  { name: "Jump rope", met: 10 },
  { name: "Martial arts", met: 7.5 },
  { name: "Padel", met: 6 },
  { name: "Pickleball", met: 4.5 },
  { name: "Rugby", met: 8.3 },
  { name: "Softball", met: 5 },
  { name: "Squash", met: 7.3 },
  { name: "Swimming", met: 7 },
  { name: "Table tennis", met: 4 },
  { name: "Tennis", met: 7.3 },
  { name: "Ultimate frisbee", met: 8 },
  { name: "Volleyball", met: 4 },
  { name: "Yoga", met: 2.5 },
];
export const DEFAULT_SPORT_MET = 6;

export function sportMet(name: string) {
  const n = name.trim().toLowerCase();
  return SPORTS.find((s) => s.name.toLowerCase() === n)?.met ?? null;
}

export const WEIGHT_TRAINING_MET = 5;
/** When no duration is entered for weight training, assume this many minutes per set (incl. rest). */
export const MIN_PER_SET = 3;

/** Running METs by speed (km/h). */
const RUN_METS: [number, number][] = [
  [6.5, 4.3], // brisk walk
  [8, 7],
  [9, 8.3],
  [10.5, 9.8],
  [12, 11],
  [13.5, 11.8],
  [15, 12.8],
  [Infinity, 14.5],
];
export const UNKNOWN_RUN_MET = 8.3;

export const KM_PER_MI = 1.609344;

export function runMet(seconds: number, distance: number | null, unit: "km" | "mi") {
  if (!distance || !seconds) return UNKNOWN_RUN_MET;
  const km = unit === "mi" ? distance * KM_PER_MI : distance;
  const kmh = km / (seconds / 3600);
  return RUN_METS.find(([max]) => kmh < max)![1];
}

export function exerciseKcal(met: number, kg: number, minutes: number) {
  return Math.max(met - 1, 0) * kg * (minutes / 60);
}

// ---------- entries ----------

export interface SportSet {
  us: number | null;
  them: number | null;
}

export interface SportEntry {
  key: string;
  sport: string;
  minutes: number | null;
  intensity: Intensity;
  sets: SportSet[];
}

export interface RunEntry {
  key: string;
  seconds: number | null;
  distance: number | null;
  unit: "km" | "mi";
}

export function sportKcal(s: { sport: string; minutes: number | null; intensity: Intensity }, kg: number) {
  if (!s.minutes) return 0;
  const factor = INTENSITIES.find((i) => i.value === s.intensity)?.factor ?? 1;
  return exerciseKcal((sportMet(s.sport) ?? DEFAULT_SPORT_MET) * factor, kg, s.minutes);
}

export function runKcal(r: { seconds: number | null; distance: number | null; unit: "km" | "mi" }, kg: number) {
  if (!r.seconds) return 0;
  return exerciseKcal(runMet(r.seconds, r.distance, r.unit), kg, r.seconds / 60);
}

/** Minutes of weight training: the entered duration, or an estimate from the number of sets. */
export function weightTrainingMinutes(durationMin: number | null, totalSets: number) {
  return durationMin ?? totalSets * MIN_PER_SET;
}

export function weightTrainingKcal(durationMin: number | null, totalSets: number, kg: number) {
  return exerciseKcal(WEIGHT_TRAINING_MET, kg, weightTrainingMinutes(durationMin, totalSets));
}

export function formatPace(seconds: number, distance: number, unit: "km" | "mi") {
  const per = seconds / distance;
  const m = Math.floor(per / 60);
  const s = Math.round(per % 60);
  return `${m}:${String(s).padStart(2, "0")} /${unit}`;
}

export function formatHms(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- profile / baseline ----------

export interface Profile {
  sex: "male" | "female" | null;
  birth_year: number | null;
  height_cm: number | null;
  activity_factor: number;
}

export const ACTIVITY_LEVELS: { value: number; label: string; hint: string }[] = [
  { value: 1.2, label: "Mostly sitting", hint: "Desk job, little walking" },
  { value: 1.3, label: "Lightly active", hint: "Some walking during the day" },
  { value: 1.45, label: "On your feet", hint: "Standing or walking most of the day" },
  { value: 1.6, label: "Physical job", hint: "Manual work most of the day" },
];

export function profileComplete(p: Profile | null): p is Profile & { sex: "male" | "female"; birth_year: number; height_cm: number } {
  return !!p && !!p.sex && !!p.birth_year && !!p.height_cm;
}

/** Calories burned in a day without any logged workouts (BMR × activity factor). */
export function baselineKcal(p: Profile | null, kg: number, date: string) {
  if (!profileComplete(p)) return null;
  const age = Number(date.slice(0, 4)) - p.birth_year;
  const bmr = 10 * kg + 6.25 * p.height_cm - 5 * age + (p.sex === "male" ? 5 : -161);
  return bmr * p.activity_factor;
}

export const FALLBACK_KG = 70;

/** Body weight to use for a date: the latest weigh-in on or before it, else the earliest one after it. */
export function weightOn(date: string, weights: { date: string; kg: number }[]) {
  // weights must be sorted by date ascending
  let found: number | null = null;
  for (const w of weights) {
    if (w.date <= date) found = w.kg;
    else return found ?? w.kg;
  }
  return found;
}
