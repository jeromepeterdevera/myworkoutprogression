/** "HH:MM" -> minutes after midnight */
export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM" from minutes after midnight (wraps around the day) */
export function fromMinutes(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes between going to bed and waking up; crossing midnight is handled. */
export function sleepMinutes(bed: string | null | undefined, wake: string | null | undefined) {
  if (!bed || !wake) return null;
  let d = toMinutes(wake) - toMinutes(bed);
  if (d <= 0) d += 1440;
  return d;
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 13:05 -> "1:05 PM" in the user's locale */
export function formatClock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const CYCLE_MIN = 90;
export const FALL_ASLEEP_MIN = 15;

export const SLEEP_GOAL_KEY = "sleep-goal-min";
export const SLEEP_GOALS = [420, 450, 480, 510, 540];

export function readSleepGoal() {
  try {
    const v = Number(localStorage.getItem(SLEEP_GOAL_KEY));
    if (SLEEP_GOALS.includes(v)) return v;
  } catch {}
  return 480;
}

/** What we know about the day before a night, to guess how long it took to fall asleep. */
export interface SleepContext {
  /** workout calories burned the day before (the day you went to bed) */
  exerciseKcal: number | null;
  /** that day's intake − burn, null if meals or profile are missing */
  balance: number | null;
  /** estimated minutes asleep the night before, null if not logged */
  prevNightAsleep: number | null;
  /** bedtimes ("HH:MM") of up to the 7 nights before */
  recentBeds: string[];
  /** sleep goal in minutes, used as your sleep need */
  goalMin: number;
}

export interface LatencyFactor {
  label: string;
  minutes: number;
}

const BASE_LATENCY = 15;
const MIN_LATENCY = 5;
const MAX_LATENCY = 60;

// bedtimes on a noon-to-noon scale so 23:30 and 00:30 are an hour apart, not 23
const nightMinutes = (t: string) => (toMinutes(t) + 720) % 1440;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Educated guess at how long it took to fall asleep after getting into bed (sleep onset latency).
 * Starts from a typical 15 minutes and adjusts for:
 *  - how active the day was: more exercise builds sleep pressure (up to 5 min faster, a rest day is a bit slower)
 *  - eating: a big surplus or a big deficit (going to bed hungry) both make it slower
 *  - sleep debt: a short night before makes you fall asleep faster
 *  - bedtime: going to bed well before your usual time makes it slower, later makes it faster
 * The result is kept between 5 and 60 minutes.
 */
export function estimateLatency(bed: string, ctx: SleepContext): { minutes: number; factors: LatencyFactor[] } {
  const factors: LatencyFactor[] = [];
  const add = (label: string, m: number) => {
    const r = Math.round(m);
    if (r !== 0) factors.push({ label, minutes: r });
  };

  if (ctx.exerciseKcal != null) {
    const k = ctx.exerciseKcal;
    if (k < 50) add("Rest day, less sleep pressure", 3);
    else add(`Active day (≈ ${Math.round(k)} kcal of workouts)`, -5 * Math.min(k, 800) / 800);
  }

  if (ctx.balance != null) {
    const b = ctx.balance;
    if (b > 300) add(`Ate ${Math.round(b)} kcal more than you burned`, Math.min(6, (b - 300) / 150));
    else if (b < -700) add(`Big deficit (${Math.round(-b)} kcal), hunger can keep you up`, Math.min(6, (-b - 700) / 150));
  }

  if (ctx.prevNightAsleep != null) {
    const short = ctx.goalMin - ctx.prevNightAsleep;
    if (short > 30) add(`Short sleep the night before (${formatDuration(ctx.prevNightAsleep)})`, -Math.min(8, (short / 60) * 3));
    else if (short < -60) add("Slept long the night before", Math.min(4, ((-short - 60) / 60) * 2));
  }

  if (ctx.recentBeds.length >= 3) {
    const sorted = ctx.recentBeds.map(nightMinutes).sort((a, b) => a - b);
    const usual = sorted[Math.floor(sorted.length / 2)];
    const earlier = usual - nightMinutes(bed);
    if (earlier > 30) add(`In bed ${formatDuration(earlier)} earlier than usual`, Math.min(12, ((earlier - 30) / 60) * 8));
    else if (earlier < -30) add(`In bed ${formatDuration(-earlier)} later than usual`, -Math.min(5, ((-earlier - 30) / 60) * 4));
  }

  const raw = BASE_LATENCY + factors.reduce((a, f) => a + f.minutes, 0);
  return { minutes: Math.round(clamp(raw, MIN_LATENCY, MAX_LATENCY)), factors };
}

/** Estimated minutes asleep: time in bed minus the time it took to fall asleep. */
export function asleepMinutes(inBed: number, latency: number) {
  return Math.max(0, inBed - latency);
}
